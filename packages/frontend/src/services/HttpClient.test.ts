import { healthResponseSchema, sessionSchema } from '@erp/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, HttpClient } from './HttpClient';

afterEach(() => vi.unstubAllGlobals());

const healthy = {
  status: 'ok',
  version: '0.0.0-dev',
  time: '2026-11-14T06:00:00.000Z',
  checks: { database: 'ok' },
};
const stubFetch = (status: number, body: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );

describe('HttpClient', () => {
  it('calls /api/<path> and validates the body with the shared schema', async () => {
    stubFetch(200, healthy);
    await expect(new HttpClient().getJson('/health', healthResponseSchema)).resolves.toEqual(healthy);
    expect(fetch).toHaveBeenCalledWith('/api/health', expect.anything());
  });

  it('throws ApiRequestError carrying the shared error shape on a non-2xx status', async () => {
    stubFetch(404, { code: 'NOT_FOUND', message: 'No route', fields: [], requestId: 'r1' });
    await expect(new HttpClient().getJson('/x', healthResponseSchema)).rejects.toBeInstanceOf(
      ApiRequestError,
    );
  });

  it('POSTs a JSON body with the Idempotency-Key header, and validates the reply', async () => {
    stubFetch(201, healthy);
    const body = { amount: '12500.00' };
    await expect(
      new HttpClient().postJson('/v1/payments', body, healthResponseSchema, { idempotencyKey: 'key-1' }),
    ).resolves.toEqual(healthy);
    // The session cookie travels on every call (ADR 0018 section 2).
    expect(fetch).toHaveBeenCalledWith('/api/v1/payments', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'Idempotency-Key': 'key-1' },
      body: JSON.stringify(body),
    });
  });

  it('throws ApiRequestError on a failed POST', async () => {
    stubFetch(400, { code: 'VALIDATION_FAILED', message: 'Bad', fields: [], requestId: 'r2' });
    await expect(new HttpClient().postJson('/x', {}, healthResponseSchema)).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe('HttpClient: the session cookie travels, and nothing else (ADR 0018 section 2)', () => {
  const session = {
    user: { id: '0196f000-0000-7000-8000-000000000001', name: 'Demo Owner' },
    expiresAt: '2099-01-01T00:00:00.000Z',
  };

  it('GET sends the cookie (same-origin credentials) and no Authorization header', async () => {
    stubFetch(200, healthy);
    await new HttpClient().getJson('/health', healthResponseSchema);
    const init = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(init).toMatchObject({ credentials: 'same-origin' });
    expect(JSON.stringify(init?.headers ?? {})).not.toMatch(/authorization/i);
  });

  it('postJson sends JSON with the cookie and validates the answer with the shared schema', async () => {
    stubFetch(200, { ...session, token: 'never-kept' });
    const answer = await new HttpClient().postJson(
      '/v1/auth/login',
      { login: 'a@example.com' },
      sessionSchema,
    );
    expect(answer).toEqual(session);
    expect(fetch).toHaveBeenCalledWith('/api/v1/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'a@example.com' }),
    });
  });

  it('postJson throws ApiRequestError with the shared error shape on a 401', async () => {
    stubFetch(401, {
      code: 'UNAUTHENTICATED',
      message: 'Login or password is wrong.',
      fields: [],
      requestId: 'r2',
    });
    const error = await new HttpClient()
      .postJson('/v1/auth/login', {}, sessionSchema)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).status).toBe(401);
  });

  it('post accepts a 204 with no body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204 })),
    );
    await expect(new HttpClient().post('/v1/auth/logout')).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/auth/logout',
      expect.objectContaining({ method: 'POST', credentials: 'same-origin' }),
    );
  });
});

describe('HttpClient: Idempotency-Key on money and stock POSTs (ADR 0011)', () => {
  it('postJson sends the key when given, and no key otherwise', async () => {
    stubFetch(201, healthy);
    await new HttpClient().postJson('/v1/sales', { a: 1 }, healthResponseSchema, { idempotencyKey: 'key-1' });
    await new HttpClient().postJson('/v1/notes', { a: 1 }, healthResponseSchema);
    const calls = vi
      .mocked(fetch)
      .mock.calls.map(([, init]) => (init?.headers ?? {}) as Record<string, string>);
    expect(calls[0]?.['Idempotency-Key']).toBe('key-1');
    expect(calls[1]).not.toHaveProperty('Idempotency-Key');
  });
});

describe('HttpClient: the active scope travels on every call (ADR 0007, tenantMiddleware)', () => {
  const scope = {
    businessId: '0196f000-0000-7000-8000-0000000000a1',
    branchId: '0196f000-0000-7000-8000-0000000001a1',
  };
  const headersOf = (call: number) =>
    (vi.mocked(fetch).mock.calls[call]?.[1] as { headers: Record<string, string> }).headers;

  it('sends X-Business-Id and X-Branch-Id on a GET and a POST once a business and branch are chosen', async () => {
    stubFetch(200, healthy);
    const http = new HttpClient('/api', () => scope);
    await http.getJson('/v1/parties', healthResponseSchema);
    await http.postJson('/v1/payments', {}, healthResponseSchema, { idempotencyKey: 'k' });
    for (const call of [0, 1]) {
      expect(headersOf(call)).toMatchObject({
        'X-Business-Id': scope.businessId,
        'X-Branch-Id': scope.branchId,
      });
    }
  });

  it('sends neither before a scope is chosen (the login and the business switcher)', async () => {
    stubFetch(200, healthy);
    await new HttpClient('/api', () => null).getJson('/v1/me/businesses', healthResponseSchema);
    expect(Object.keys(headersOf(0))).not.toContain('X-Business-Id');
    expect(Object.keys(headersOf(0))).not.toContain('X-Branch-Id');
  });
});

describe('HttpClient.patchJson (task 4 T3: PATCH /v1/parties/:id)', () => {
  it('PATCHes a JSON body with the active scope, and validates the reply', async () => {
    stubFetch(200, healthy);
    const scope = {
      businessId: '0196f000-0000-7000-8000-0000000000a1',
      branchId: '0196f000-0000-7000-8000-0000000001a1',
    };
    await expect(
      new HttpClient('/api', () => scope).patchJson('/v1/parties/p1', { version: 1 }, healthResponseSchema),
    ).resolves.toEqual(healthy);
    expect(fetch).toHaveBeenCalledWith('/api/v1/parties/p1', {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Business-Id': scope.businessId,
        'X-Branch-Id': scope.branchId,
      },
      body: JSON.stringify({ version: 1 }),
    });
  });

  it('throws ApiRequestError on a refused PATCH, keeping the API error', async () => {
    stubFetch(409, { code: 'CONFLICT', message: 'Stale', fields: [], requestId: 'r3' });
    await expect(new HttpClient().patchJson('/x', {}, healthResponseSchema)).rejects.toMatchObject({
      status: 409,
    });
  });
});

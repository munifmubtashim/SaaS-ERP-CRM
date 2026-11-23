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

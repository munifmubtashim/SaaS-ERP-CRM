import { healthResponseSchema } from '@erp/shared';
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
    expect(fetch).toHaveBeenCalledWith('/api/v1/payments', {
      method: 'POST',
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

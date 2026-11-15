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
});

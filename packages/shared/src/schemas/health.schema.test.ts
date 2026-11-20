import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from './health.schema.js';

/** GET /health: read by uptime checks and the frontend status panel, so its shape must not drift. */
describe('healthResponseSchema', () => {
  const healthy = {
    status: 'ok',
    version: '0.0.0',
    time: '2026-11-20T10:00:00.000Z',
    checks: { database: 'ok' },
  };

  it('accepts a healthy and a degraded response', () => {
    expect(healthResponseSchema.safeParse(healthy).success).toBe(true);
    expect(
      healthResponseSchema.safeParse({ ...healthy, status: 'degraded', checks: { database: 'down' } })
        .success,
    ).toBe(true);
  });

  it('refuses a status or dependency state outside the two known values', () => {
    expect(healthResponseSchema.safeParse({ ...healthy, status: 'down' }).success).toBe(false);
    expect(healthResponseSchema.safeParse({ ...healthy, checks: { database: 'slow' } }).success).toBe(false);
  });

  it('requires the database check', () => {
    expect(healthResponseSchema.safeParse({ ...healthy, checks: {} }).success).toBe(false);
  });

  it('takes the time in UTC only: an offset, a bare date or a non-date is refused', () => {
    for (const time of ['2026-11-20T16:00:00+06:00', '2026-11-20', 'yesterday', '']) {
      expect(healthResponseSchema.safeParse({ ...healthy, time }).success, time).toBe(false);
    }
  });

  it('drops unknown keys, so no internal detail rides along to a public route', () => {
    const parsed = healthResponseSchema.parse({
      ...healthy,
      databaseUrl: 'postgres://example',
      checks: { database: 'ok', redis: 'ok' },
    });
    expect(parsed).toEqual(healthy);
  });
});

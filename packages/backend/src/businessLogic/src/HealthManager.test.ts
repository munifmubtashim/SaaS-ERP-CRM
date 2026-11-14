import { healthResponseSchema } from '@erp/shared';
import { describe, expect, it } from 'vitest';
import { HealthManager } from './HealthManager.js';

const fixedNow = () => new Date('2026-11-14T06:00:00Z');
const queryReturning = (databaseOk: boolean) => ({ ping: async () => ({ databaseOk, latencyMs: 1 }) });

describe('HealthManager', () => {
  it('reports ok when the database answers', async () => {
    const health = await new HealthManager(queryReturning(true), '1.2.3', fixedNow).getHealth();
    expect(healthResponseSchema.parse(health)).toEqual({
      status: 'ok',
      version: '1.2.3',
      time: '2026-11-14T06:00:00.000Z',
      checks: { database: 'ok' },
    });
  });

  it('reports degraded, not an error, when the database is down', async () => {
    const health = await new HealthManager(queryReturning(false), '1.2.3', fixedNow).getHealth();
    expect(health.status).toBe('degraded');
    expect(health.checks.database).toBe('down');
  });
});

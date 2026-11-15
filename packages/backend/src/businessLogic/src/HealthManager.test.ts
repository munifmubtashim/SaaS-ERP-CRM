import { HealthDTO } from '@erp/dal';
import { healthResponseSchema } from '@erp/shared';
import { describe, expect, it } from 'vitest';
import type { IClock } from './contracts/IClock.js';
import type { IHealthQuery } from './contracts/IHealthQuery.js';
import { HealthManager } from './HealthManager.js';

/** Fake IHealthQuery: no database. The Manager only knows the interface, so any implementation fits. */
class FakeHealthQuery implements IHealthQuery {
  calls = 0;
  constructor(private readonly databaseOk: boolean) {}
  async ping(): Promise<HealthDTO> {
    this.calls += 1;
    return HealthDTO.fromProbe(this.databaseOk, 1);
  }
}

class FixedClock implements IClock {
  now(): Date {
    return new Date('2026-11-14T06:00:00Z');
  }
}

describe('HealthManager with an injected fake IHealthQuery', () => {
  it('reports ok when the query says the database answers', async () => {
    const query = new FakeHealthQuery(true);
    const health = await new HealthManager(query, new FixedClock(), '1.2.3').getHealth();
    expect(query.calls).toBe(1);
    expect(healthResponseSchema.parse(health)).toEqual({
      status: 'ok',
      version: '1.2.3',
      time: '2026-11-14T06:00:00.000Z',
      checks: { database: 'ok' },
    });
  });

  it('reports degraded, not an error, when the database is down', async () => {
    const health = await new HealthManager(new FakeHealthQuery(false), new FixedClock(), '1.2.3').getHealth();
    expect(health).toMatchObject({ status: 'degraded', checks: { database: 'down' } });
  });
});

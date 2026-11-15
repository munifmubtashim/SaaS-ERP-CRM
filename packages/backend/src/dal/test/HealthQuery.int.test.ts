import { afterAll, describe, expect, it } from 'vitest';
import { createDbClient } from '../config/db.js';
import { HealthQuery } from '../query/HealthQuery.js';

// Real PostgreSQL (docker compose locally, a service container in CI). No database mocks (roadmap 4.1).
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl)
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and run npm run docker:up.');
const db = createDbClient(databaseUrl);

afterAll(async () => {
  await db.$disconnect();
});

describe('dal against a real database', () => {
  it('HealthQuery runs SELECT 1', async () => {
    const result = await new HealthQuery(db).ping();
    expect(result.databaseOk).toBe(true);
  });

  it('connects as the application role: not superuser, not BYPASSRLS (roadmap 4.2 rule 3)', async () => {
    const rows = await db.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
      SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    expect(rows).toEqual([{ rolsuper: false, rolbypassrls: false }]);
  });

  it('reports the database as down instead of throwing when it cannot connect', async () => {
    const broken = createDbClient('postgresql://nobody:wrong@127.0.0.1:1/none');
    const result = await new HealthQuery(broken).ping();
    expect(result.databaseOk).toBe(false);
    await broken.$disconnect();
  });
});

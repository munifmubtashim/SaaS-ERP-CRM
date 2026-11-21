import { createManagers, DenyAllRoleSource } from '@erp/business-logic';
import { healthResponseSchema } from '@erp/shared';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { silentLogger } from '../helpers.js';

// Full slice against a real PostgreSQL: HealthRoutes -> HealthController -> HealthManager -> HealthQuery.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl)
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and run npm run docker:up.');
const { managers, close } = createManagers({
  databaseUrl,
  version: 'integration',
  dbPoolMax: 10,
  dbTxTimeoutMs: 10_000,
  roleSource: new DenyAllRoleSource(),
});

afterAll(async () => {
  await close();
});

describe('health through every layer', () => {
  it('reports the database as ok', async () => {
    const res = await request(createApp({ logger: silentLogger, managers })).get('/health');
    expect(res.status).toBe(200);
    expect(healthResponseSchema.parse(res.body).checks.database).toBe('ok');
  });
});

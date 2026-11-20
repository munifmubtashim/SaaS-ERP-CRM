import { apiErrorSchema, healthResponseSchema, livenessResponseSchema } from '@erp/shared';
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createApp } from '../../app.js';
import { errorMiddleware } from '../../middleware/errorMiddleware.js';
import { parseInput } from '../../middleware/validate.js';
import { fakeManagers, managersWithDatabase, silentLogger } from '../helpers.js';

const appWith = (databaseOk: boolean) =>
  createApp({ logger: silentLogger, managers: managersWithDatabase(databaseOk) });

describe('GET /health (HealthRoutes -> HealthController -> HealthManager)', () => {
  it('returns 200 and the shared health contract when the database answers', async () => {
    const res = await request(appWith(true)).get('/health');
    expect(res.status).toBe(200);
    expect(healthResponseSchema.parse(res.body)).toMatchObject({ status: 'ok', checks: { database: 'ok' } });
  });

  it('returns 503 when the database is down, so uptime checks alert', async () => {
    const res = await request(appWith(false)).get('/health');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'degraded', checks: { database: 'down' } });
  });

  it('echoes a well-formed X-Request-Id and replaces a malformed one', async () => {
    const good = await request(appWith(true)).get('/health').set('X-Request-Id', 'abc12345-trace');
    expect(good.headers['x-request-id']).toBe('abc12345-trace');
    const bad = await request(appWith(true)).get('/health').set('X-Request-Id', 'bad id <script>');
    expect(bad.headers['x-request-id']).not.toContain('bad id');
  });
});

describe('GET /health/live: liveness for the host, never the database (Farhan, #17)', () => {
  it('returns 200 without asking the health manager, even when the database is down', async () => {
    const getHealth = vi.fn(async () => {
      throw new Error('liveness must not check the database');
    });
    const app = createApp({ logger: silentLogger, managers: fakeManagers({ getHealth }) });
    const res = await request(app).get('/health/live');
    expect(res.status).toBe(200);
    expect(livenessResponseSchema.parse(res.body)).toEqual({ status: 'ok' });
    expect(getHealth).not.toHaveBeenCalled();
  });
});

describe('error shape {code, message, fields[], requestId}', () => {
  it('is used for unknown routes, including stub module paths with no routes yet', async () => {
    const res = await request(appWith(true)).get('/v1/sales/anything');
    expect(res.status).toBe(404);
    const err = apiErrorSchema.parse(res.body);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.requestId).toBe(res.headers['x-request-id']);
  });

  it('lists every invalid field when Zod validation fails', async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as unknown as { id: string }).id = 'req-test-1';
      next();
    });
    const schema = z.object({ amount: z.string().regex(/^\d+\.\d{2}$/), qty: z.number().positive() });
    app.post('/probe', (req, res) => {
      res.json(parseInput(schema, req.body));
    });
    app.use(errorMiddleware);

    const res = await request(app).post('/probe').send({ amount: 12.5, qty: -1 });
    expect(res.status).toBe(400);
    const err = apiErrorSchema.parse(res.body);
    expect(err.code).toBe('VALIDATION_FAILED');
    expect(err.fields.map((f) => f.path).sort()).toEqual(['amount', 'qty']);
  });

  it('rejects malformed JSON with VALIDATION_FAILED, not a 500', async () => {
    const res = await request(appWith(true))
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":');
    expect(res.status).toBe(400);
    expect(apiErrorSchema.parse(res.body).code).toBe('VALIDATION_FAILED');
  });
});

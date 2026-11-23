import { AppError } from '@erp/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import type { IAuthManager, LoginOutcome } from '../../controllers/contracts/index.js';
import { LoginRateLimiter } from '../../middleware/loginRateLimit.js';
import { fakeManagers, FakeHealthManager, noTenantScope, silentLogger } from '../helpers.js';

/**
 * ADR 0018 section 2 (CSRF: every non-GET request carries the app's Origin, else 403) and section 4 step 7 (at most
 * 20 login attempts per IP per 15 minutes, then 429), tests 9 and 4. AuthManager is a fake that refuses every login.
 */
const ORIGIN = 'https://erp.example.com';
const MINUTE = 60_000;

const refuseAll: IAuthManager = {
  login: (): Promise<LoginOutcome> =>
    Promise.reject(new AppError('UNAUTHENTICATED', 'Login or password is wrong.')),
  authenticate: () => Promise.reject(new AppError('UNAUTHENTICATED', 'Sign in again.')),
  logout: () => Promise.resolve(),
  resolveScope: () => Promise.reject(new AppError('NOT_FOUND', 'Business or branch not found.')),
};

function appWith(clock = { now: 0 }) {
  return createApp({
    logger: silentLogger,
    managers: { ...fakeManagers(new FakeHealthManager(true)), auth: refuseAll },
    tenantScope: noTenantScope,
    appOrigin: ORIGIN,
    loginRateLimiter: new LoginRateLimiter(() => clock.now),
  });
}

const BODY = { login: 'owner@example.com', password: 'wrong-password' };
const attempt = (app: ReturnType<typeof appWith>, ip = '203.0.113.7') =>
  request(app).post('/v1/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', ip).send(BODY);

describe('test 9: a non-GET request without the app Origin is refused (ADR 0018 section 2)', () => {
  it.each([
    ['no Origin', undefined],
    ['another site', 'https://evil.example.net'],
    ['the right host over http', 'http://erp.example.com'],
    ['the literal null origin', 'null'],
  ])('%s: 403 FORBIDDEN, and the login never runs', async (_name, origin) => {
    const req = request(appWith()).post('/v1/auth/login');
    const res = await (origin ? req.set('Origin', origin) : req).send(BODY);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('the app Origin passes (the login then answers for itself)', async () => {
    expect((await attempt(appWith())).status).toBe(401);
  });

  it('applies to logout too', async () => {
    expect((await request(appWith()).post('/v1/auth/logout')).status).toBe(403);
    expect((await request(appWith()).post('/v1/auth/logout').set('Origin', ORIGIN)).status).toBe(204);
  });

  it('a GET needs no Origin', async () => {
    expect((await request(appWith()).get('/health')).status).toBe(200);
  });
});

describe('test 4: at most 20 login attempts per IP per 15 minutes (ADR 0018 section 4, step 7)', () => {
  it('the 21st attempt from one IP within 15 minutes is 429 RATE_LIMITED', async () => {
    const app = appWith();
    for (let i = 0; i < 20; i += 1) expect((await attempt(app)).status).toBe(401);
    const res = await attempt(app);
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('RATE_LIMITED');
  });

  it('another IP is not held back by the first one', async () => {
    const app = appWith();
    for (let i = 0; i < 21; i += 1) await attempt(app, '203.0.113.7');
    expect((await attempt(app, '198.51.100.9')).status).toBe(401);
  });

  it('attempts older than 15 minutes no longer count', async () => {
    const clock = { now: 0 };
    const app = appWith(clock);
    for (let i = 0; i < 20; i += 1) await attempt(app);
    clock.now = 15 * MINUTE - 1;
    expect((await attempt(app)).status).toBe(429);
    clock.now = 15 * MINUTE;
    expect((await attempt(app)).status).toBe(401);
  });

  it('only login is limited: logout from the same IP still works', async () => {
    const app = appWith();
    for (let i = 0; i < 21; i += 1) await attempt(app);
    const res = await request(app)
      .post('/v1/auth/logout')
      .set('Origin', ORIGIN)
      .set('X-Forwarded-For', '203.0.113.7');
    expect(res.status).toBe(204);
  });
});

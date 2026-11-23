import { AppError } from '@erp/shared';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import type { AuthenticatedSession, IAuthManager } from '../../controllers/contracts/index.js';
import { createAuthMiddleware } from '../../middleware/authMiddleware.js';
import { errorMiddleware } from '../../middleware/errorMiddleware.js';
import { fakeManagers, FakeHealthManager, noTenantScope, silentLogger } from '../helpers.js';

/**
 * ADR 0018 section 6 (authMiddleware) and section 3 (logout), the HTTP half. AuthManager is a fake holding one
 * valid token; the session rules (expiry, active user, same organization) are tested in businessLogic and dal.
 */
const TOKEN = 'tok_valid_4f9c2b7d';
/** createApp's default app origin (development); every non-GET request must carry it (ADR 0018 section 2). */
const DEV_ORIGIN = 'http://localhost:5173';
const WHO: AuthenticatedSession = {
  userId: '01937000-0000-7000-8000-0000000000b0',
  organizationId: '01937000-0000-7000-8000-0000000000a0',
  sessionId: '01937000-0000-7000-8000-0000000000c0',
};

class FakeAuthManager implements IAuthManager {
  revoked = new Set<string>();
  authenticated: string[] = [];
  async login(): Promise<never> {
    throw new AppError('INTERNAL_ERROR', 'not used here');
  }
  async resolveScope(): Promise<never> {
    throw new AppError('INTERNAL_ERROR', 'not used here');
  }
  async authenticate(token: string): Promise<AuthenticatedSession> {
    this.authenticated.push(token);
    if (token !== TOKEN || this.revoked.has(token)) throw new AppError('UNAUTHENTICATED', 'Sign in again.');
    return WHO;
  }
  async logout(token: string): Promise<void> {
    this.revoked.add(token);
  }
}

/** The middleware alone, in front of a handler that echoes req.auth. */
function echoApp(auth: IAuthManager, secure = true) {
  const app = express();
  app.use('/v1', createAuthMiddleware(auth, { secure }));
  app.all('/v1/*rest', (req, res) => {
    res.json({ auth: req.auth ?? null });
  });
  app.use(errorMiddleware);
  return app;
}

function fullApp(auth: FakeAuthManager) {
  const managers = { ...fakeManagers(new FakeHealthManager(true)), auth };
  return createApp({
    logger: silentLogger,
    managers,
    tenantScope: noTenantScope,
    sessionCookie: { secure: true },
  });
}

describe('authMiddleware (ADR 0018 section 6)', () => {
  it('a valid session cookie sets req.auth: user, organization, session, and no roles until A6', async () => {
    const res = await request(echoApp(new FakeAuthManager()))
      .get('/v1/anything')
      .set('Cookie', `theme=dark; __Host-erp_sid=${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.auth).toEqual({ ...WHO, roles: [], permissions: [] });
  });

  it.each([
    ['no cookie at all', undefined],
    ['another cookie only', 'theme=dark'],
    ['an empty session cookie', '__Host-erp_sid='],
    ['the development cookie name in production', `erp_sid=${TOKEN}`],
  ])('%s is a 401 that never reaches the route', async (_name, cookie) => {
    const req = request(echoApp(new FakeAuthManager())).get('/v1/anything');
    const res = await (cookie ? req.set('Cookie', cookie) : req);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  it('a session the Manager refuses (revoked, expired, user inactive) is its 401', async () => {
    const auth = new FakeAuthManager();
    auth.revoked.add(TOKEN);
    const res = await request(echoApp(auth)).get('/v1/anything').set('Cookie', `__Host-erp_sid=${TOKEN}`);
    expect(res.status).toBe(401);
  });

  it('in development it reads erp_sid', async () => {
    const res = await request(echoApp(new FakeAuthManager(), false))
      .get('/v1/anything')
      .set('Cookie', `erp_sid=${TOKEN}`);
    expect(res.body.auth).toMatchObject(WHO);
  });

  it('public routes pass without a session and without asking the Manager', async () => {
    const auth = new FakeAuthManager();
    const res = await request(fullApp(auth)).post('/v1/auth/login').set('Origin', DEV_ORIGIN).send({});
    expect(res.status).toBe(400);
    expect(auth.authenticated).toEqual([]);
  });

  it('every other /v1 request needs a session, even one that would be a 404', async () => {
    const res = await request(fullApp(new FakeAuthManager())).get('/v1/parties');
    expect(res.status).toBe(401);
  });
});

describe('POST /v1/auth/logout (ADR 0018 section 3)', () => {
  const CLEARED =
    '__Host-erp_sid=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax';

  it('6. revokes the session, clears the cookie, and the old cookie then gets 401', async () => {
    const auth = new FakeAuthManager();
    const app = fullApp(auth);
    const res = await request(app)
      .post('/v1/auth/logout')
      .set('Origin', DEV_ORIGIN)
      .set('Cookie', `__Host-erp_sid=${TOKEN}`);
    expect(res.status).toBe(204);
    expect(res.headers['set-cookie']).toEqual([CLEARED]);
    expect([...auth.revoked]).toEqual([TOKEN]);
    const after = await request(app).get('/v1/parties').set('Cookie', `__Host-erp_sid=${TOKEN}`);
    expect(after.status).toBe(401);
  });

  it('without a cookie it still clears the cookie and revokes nothing', async () => {
    const auth = new FakeAuthManager();
    const res = await request(fullApp(auth)).post('/v1/auth/logout').set('Origin', DEV_ORIGIN);
    expect(res.status).toBe(204);
    expect(res.headers['set-cookie']).toEqual([CLEARED]);
    expect(auth.revoked.size).toBe(0);
  });
});

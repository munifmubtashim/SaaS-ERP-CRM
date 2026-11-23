import { AppError, apiErrorSchema, sessionSchema } from '@erp/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import type { IAuthManager, LoginOutcome } from '../../controllers/contracts/index.js';
import { fakeManagers, FakeHealthManager, noTenantScope, silentLogger } from '../helpers.js';

/**
 * ADR 0018 sections 2 and 4, the HTTP half: POST /v1/auth/login answers the session body and sends the session
 * cookie through the route result's headers. AuthManager is a fake; the rules are tested in businessLogic, the
 * table in dal.
 */
const OUTCOME: LoginOutcome = {
  token: 'tok_4f9c2b7d1e8a6305',
  userId: '01937000-0000-7000-8000-0000000000b0',
  displayName: 'Rahim Uddin',
  expiresAt: new Date('2026-11-22T14:00:00.000Z'),
  absoluteExpiresAt: new Date('2026-11-29T06:00:00.000Z'),
};

class FakeAuthManager implements Pick<IAuthManager, 'login'> {
  calls: { login: string; password: string; userAgent: string | null }[] = [];
  constructor(private readonly outcome: LoginOutcome | AppError = OUTCOME) {}
  async login(login: string, password: string, userAgent: string | null): Promise<LoginOutcome> {
    this.calls.push({ login, password, userAgent });
    if (this.outcome instanceof AppError) throw this.outcome;
    return this.outcome;
  }
}

function appWith(auth: FakeAuthManager, secure = true) {
  const managers = { ...fakeManagers(new FakeHealthManager(true)), auth: auth as unknown as IAuthManager };
  return createApp({
    logger: silentLogger,
    managers,
    tenantScope: noTenantScope,
    sessionCookie: { secure },
  });
}

const post = (app: ReturnType<typeof appWith>, body: unknown) =>
  request(app)
    .post('/v1/auth/login')
    .set('Origin', 'http://localhost:5173')
    .set('User-Agent', 'Vitest/1.0')
    .send(body as object);

describe('POST /v1/auth/login (ADR 0018 section 4)', () => {
  it('1. answers 200 with the session body and sets a __Host- cookie: HttpOnly, Secure, SameSite=Lax, Path=/', async () => {
    const auth = new FakeAuthManager();
    const res = await post(appWith(auth), { login: ' Owner@Example.com ', password: 'right-password' });
    expect(res.status).toBe(200);
    expect(sessionSchema.parse(res.body)).toEqual({
      user: { id: OUTCOME.userId, name: 'Rahim Uddin' },
      expiresAt: '2026-11-22T14:00:00.000Z',
    });
    expect(res.headers['set-cookie']).toEqual([
      '__Host-erp_sid=tok_4f9c2b7d1e8a6305; Path=/; Expires=Sun, 29 Nov 2026 06:00:00 GMT; HttpOnly; Secure; SameSite=Lax',
    ]);
    expect(auth.calls).toEqual([
      { login: 'Owner@Example.com', password: 'right-password', userAgent: 'Vitest/1.0' },
    ]);
  });

  it('the token travels only in the cookie, never in the body', async () => {
    const res = await post(appWith(new FakeAuthManager()), {
      login: 'owner@example.com',
      password: 'right-password',
    });
    expect(JSON.stringify(res.body)).not.toContain(OUTCOME.token);
  });

  it('in development over http the cookie is erp_sid, without the __Host- prefix and without Secure', async () => {
    const res = await post(appWith(new FakeAuthManager(), false), {
      login: 'owner@example.com',
      password: 'right-password',
    });
    expect(res.headers['set-cookie']).toEqual([
      'erp_sid=tok_4f9c2b7d1e8a6305; Path=/; Expires=Sun, 29 Nov 2026 06:00:00 GMT; HttpOnly; SameSite=Lax',
    ]);
  });

  it('2. a refused login is the 401 the Manager threw, with no cookie', async () => {
    const auth = new FakeAuthManager(new AppError('UNAUTHENTICATED', 'Login or password is wrong.'));
    const res = await post(appWith(auth), { login: 'owner@example.com', password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(apiErrorSchema.parse(res.body)).toMatchObject({
      code: 'UNAUTHENTICATED',
      message: 'Login or password is wrong.',
    });
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('a body that fails loginRequestSchema is a 400 and never reaches the Manager', async () => {
    const auth = new FakeAuthManager();
    const res = await post(appWith(auth), { login: 'not a phone or email', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(auth.calls).toEqual([]);
  });
});

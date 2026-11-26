import { AppError } from '@erp/shared';
import { describe, expect, it } from 'vitest';
import { AuthManager, type SessionLifetimes } from './AuthManager.js';
import type { ActiveSession, IAuthQuery, LoginUser, NewSession, ScopeGrant } from './contracts/IAuthQuery.js';
import type { IClock } from './contracts/IClock.js';
import type { IPasswordHasher } from './contracts/IPasswordHasher.js';
import type { ISessionTokens } from './contracts/ISessionTokens.js';

/**
 * ADR 0018 section 4, steps 2 to 6 without the session (the auth_session table is part 1, not built yet): the
 * same 401 for unknown, locked, inactive and wrong; the dummy-hash cost for unknown and locked users; the lock
 * after 5 failures; the rehash of old hashes. With fakes; the atomic counter is tested in dal.
 */
const NOW = new Date('2026-11-22T06:00:00Z');
const ORG = '01937000-0000-7000-8000-0000000000a0';
const USER = '01937000-0000-7000-8000-0000000000b0';
const clock: IClock = { now: () => NOW };
const HOUR = 3_600_000;
const LIFETIMES: SessionLifetimes = { idleMs: 8 * HOUR, absoluteMs: 7 * 24 * HOUR };

/** Predictable tokens: token-1, token-2, ...; the hash is the token's bytes reversed, so it never equals them. */
class FakeTokens implements ISessionTokens {
  private next = 0;
  generate(): string {
    this.next += 1;
    return `token-${this.next}`;
  }
  hash(token: string): Uint8Array {
    return Uint8Array.from(Buffer.from(token).reverse());
  }
}
const tokens = new FakeTokens();

class FakeHasher implements IPasswordHasher {
  verified: string[] = [];
  constructor(
    private readonly current = true,
    private readonly dummy = 'dummy-hash',
  ) {}
  async hash(password: string): Promise<string> {
    return `hash:${password}`;
  }
  async verify(hash: string, password: string): Promise<boolean> {
    this.verified.push(hash);
    return hash === `hash:${password}`;
  }
  needsRehash(): boolean {
    return !this.current;
  }
  dummyHash(): Promise<string> {
    return Promise.resolve(this.dummy);
  }
}

class FakeAuthQuery implements IAuthQuery {
  failed: string[] = [];
  succeeded: { userId: string; newHash: string | null }[] = [];
  /** Sessions by token hash (hex), as the real table keys them. */
  sessions = new Map<string, NewSession & { id: string; lastSeenAt: Date; revokedAt: Date | null }>();
  /** What scopeFor answers; null is "not found or not allowed". */
  grant: ScopeGrant | null = null;
  constructor(private readonly user: LoginUser | null) {}
  async scopeFor(): Promise<ScopeGrant | null> {
    return this.grant;
  }
  async createSession(session: NewSession): Promise<string> {
    const id = `session-${this.sessions.size + 1}`;
    this.sessions.set(Buffer.from(session.tokenHash).toString('hex'), {
      ...session,
      id,
      lastSeenAt: NOW,
      revokedAt: null,
    });
    return id;
  }
  async findActiveSession(tokenHash: Uint8Array, now: Date): Promise<ActiveSession | null> {
    const s = this.sessions.get(Buffer.from(tokenHash).toString('hex'));
    if (!s || s.revokedAt || s.idleExpiresAt <= now || s.absoluteExpiresAt <= now || !this.user?.isActive) {
      return null;
    }
    return {
      sessionId: s.id,
      userId: s.userId,
      organizationId: s.organizationId,
      lastSeenAt: s.lastSeenAt,
      idleExpiresAt: s.idleExpiresAt,
      absoluteExpiresAt: s.absoluteExpiresAt,
    };
  }
  async touchSession(tokenHash: Uint8Array, lastSeenAt: Date, idleExpiresAt: Date): Promise<void> {
    const s = this.sessions.get(Buffer.from(tokenHash).toString('hex'));
    if (s && !s.revokedAt) Object.assign(s, { lastSeenAt, idleExpiresAt });
  }
  async revokeSession(tokenHash: Uint8Array, now: Date): Promise<boolean> {
    const s = this.sessions.get(Buffer.from(tokenHash).toString('hex'));
    if (!s || s.revokedAt) return false;
    s.revokedAt = now;
    return true;
  }
  async revokeAllSessions(user: { id: string }, now: Date): Promise<number> {
    let count = 0;
    for (const s of this.sessions.values()) {
      if (s.userId === user.id && !s.revokedAt) {
        s.revokedAt = now;
        count += 1;
      }
    }
    return count;
  }
  async findUserForLogin(): Promise<LoginUser | null> {
    return this.user;
  }
  async recordFailedLogin(user: { id: string; organizationId: string }, now: Date): Promise<void> {
    this.failed.push(`${user.id}@${now.toISOString()}`);
  }
  async recordSuccessfulLogin(
    user: { id: string; organizationId: string },
    newHash: string | null,
  ): Promise<void> {
    this.succeeded.push({ userId: user.id, newHash });
  }
}

const user = (fields: Partial<LoginUser> = {}): LoginUser => ({
  id: USER,
  organizationId: ORG,
  passwordHash: 'hash:right-password',
  isActive: true,
  lockedUntil: null,
  failedAttempts: 0,
  displayName: 'Rahim Uddin',
  ...fields,
});

const WRONG = { code: 'UNAUTHENTICATED', message: 'Login or password is wrong.' };
const refusal = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  return { code: (error as AppError).code, message: (error as AppError).message };
};

describe('AuthManager.verifyLogin (ADR 0018 section 4)', () => {
  it('6. the right password resets the counter and returns who logged in', async () => {
    const query = new FakeAuthQuery(user({ failedAttempts: 3 }));
    const manager = new AuthManager(query, new FakeHasher(), clock, tokens, LIFETIMES);
    await expect(manager.verifyLogin('owner@example.com', 'right-password')).resolves.toEqual({
      userId: USER,
      organizationId: ORG,
      displayName: 'Rahim Uddin',
    });
    expect(query.succeeded).toEqual([{ userId: USER, newHash: null }]);
    expect(query.failed).toEqual([]);
  });

  it('2. unknown user, wrong password, locked user and inactive user all get the same 401 and message', async () => {
    const answers = await Promise.all([
      refusal(
        new AuthManager(new FakeAuthQuery(null), new FakeHasher(), clock, tokens, LIFETIMES).verifyLogin(
          'x@example.com',
          'p',
        ),
      ),
      refusal(
        new AuthManager(new FakeAuthQuery(user()), new FakeHasher(), clock, tokens, LIFETIMES).verifyLogin(
          'a@example.com',
          'bad',
        ),
      ),
      refusal(
        new AuthManager(
          new FakeAuthQuery(user({ lockedUntil: new Date(NOW.getTime() + 60_000) })),
          new FakeHasher(),
          clock,
          tokens,
          LIFETIMES,
        ).verifyLogin('a@example.com', 'right-password'),
      ),
      refusal(
        new AuthManager(
          new FakeAuthQuery(user({ isActive: false })),
          new FakeHasher(),
          clock,
          tokens,
          LIFETIMES,
        ).verifyLogin('a@example.com', 'right-password'),
      ),
    ]);
    for (const answer of answers) expect(answer).toEqual(WRONG);
  });

  it('3. an unknown user still costs one verification, against the dummy hash, and records nothing', async () => {
    const hasher = new FakeHasher();
    const query = new FakeAuthQuery(null);
    await refusal(
      new AuthManager(query, hasher, clock, tokens, LIFETIMES).verifyLogin('nobody@example.com', 'p'),
    );
    expect(hasher.verified).toEqual(['dummy-hash']);
    expect(query.failed).toEqual([]);
  });

  it('4. a locked user spends the dummy-hash cost, never checks the real hash, and counts nothing', async () => {
    const hasher = new FakeHasher();
    const query = new FakeAuthQuery(user({ lockedUntil: new Date(NOW.getTime() + 60_000) }));
    await refusal(
      new AuthManager(query, hasher, clock, tokens, LIFETIMES).verifyLogin('a@example.com', 'right-password'),
    );
    expect(hasher.verified).toEqual(['dummy-hash']);
    expect(query.failed).toEqual([]);
    expect(query.succeeded).toEqual([]);
  });

  it('5. a wrong password is recorded once, at the clock time', async () => {
    const query = new FakeAuthQuery(user());
    await refusal(
      new AuthManager(query, new FakeHasher(), clock, tokens, LIFETIMES).verifyLogin('a@example.com', 'bad'),
    );
    expect(query.failed).toEqual([`${USER}@${NOW.toISOString()}`]);
  });

  it('a lock that has ended lets the right password in', async () => {
    const query = new FakeAuthQuery(user({ lockedUntil: new Date(NOW.getTime() - 1) }));
    await expect(
      new AuthManager(query, new FakeHasher(), clock, tokens, LIFETIMES).verifyLogin(
        'a@example.com',
        'right-password',
      ),
    ).resolves.toEqual({ userId: USER, organizationId: ORG, displayName: 'Rahim Uddin' });
  });

  it('11. a hash with older settings is replaced after a successful login', async () => {
    const query = new FakeAuthQuery(user());
    await new AuthManager(query, new FakeHasher(false), clock, tokens, LIFETIMES).verifyLogin(
      'a@example.com',
      'right-password',
    );
    expect(query.succeeded).toEqual([{ userId: USER, newHash: 'hash:right-password' }]);
  });
});

describe('AuthManager.login (ADR 0018 sections 1 to 4)', () => {
  const login = (query: FakeAuthQuery, agent: string | null = 'Mozilla/5.0') =>
    new AuthManager(query, new FakeHasher(), clock, new FakeTokens(), LIFETIMES).login(
      'owner@example.com',
      'right-password',
      agent,
    );

  it('1. creates a session holding the token hash, never the token, and returns the token for the cookie', async () => {
    const query = new FakeAuthQuery(user());
    const result = await login(query);
    expect(result).toEqual({
      token: 'token-1',
      userId: USER,
      displayName: 'Rahim Uddin',
      expiresAt: new Date(NOW.getTime() + 8 * HOUR),
      absoluteExpiresAt: new Date(NOW.getTime() + 7 * 24 * HOUR),
    });
    const [stored] = [...query.sessions.values()];
    expect(stored).toMatchObject({
      userId: USER,
      organizationId: ORG,
      idleExpiresAt: new Date(NOW.getTime() + 8 * HOUR),
      absoluteExpiresAt: new Date(NOW.getTime() + 7 * 24 * HOUR),
      userAgent: 'Mozilla/5.0',
    });
    expect(Buffer.from(stored?.tokenHash ?? []).toString()).not.toContain('token-1');
  });

  it('6. every login creates a new session with a new token (no session fixation)', async () => {
    const query = new FakeAuthQuery(user());
    const manager = new AuthManager(query, new FakeHasher(), clock, new FakeTokens(), LIFETIMES);
    const first = await manager.login('owner@example.com', 'right-password', null);
    const second = await manager.login('owner@example.com', 'right-password', null);
    expect(first.token).not.toBe(second.token);
    expect(query.sessions.size).toBe(2);
  });

  it('keeps only the first 200 characters of the user agent', async () => {
    const query = new FakeAuthQuery(user());
    await login(query, 'x'.repeat(500));
    expect([...query.sessions.values()][0]?.userAgent).toHaveLength(200);
  });

  it('a refused login creates no session', async () => {
    const query = new FakeAuthQuery(user());
    await refusal(
      new AuthManager(query, new FakeHasher(), clock, new FakeTokens(), LIFETIMES).login(
        'a@example.com',
        'bad',
        null,
      ),
    );
    expect(query.sessions.size).toBe(0);
  });
});

describe('AuthManager.authenticate and logout (ADR 0018 sections 3 and 6)', () => {
  const MINUTE = 60_000;
  const at = (ms: number): IClock => ({ now: () => new Date(NOW.getTime() + ms) });

  /** Logs in at NOW and returns the query, the token and a function that builds a Manager at a later time. */
  async function signedIn(lifetimes = LIFETIMES) {
    const query = new FakeAuthQuery(user());
    const sessionTokens = new FakeTokens();
    const { token } = await new AuthManager(query, new FakeHasher(), clock, sessionTokens, lifetimes).login(
      'owner@example.com',
      'right-password',
      null,
    );
    const later = (ms: number) => new AuthManager(query, new FakeHasher(), at(ms), sessionTokens, lifetimes);
    return { query, token, later, stored: () => [...query.sessions.values()][0] };
  }

  it('a valid session gives who is calling: user, organization and session', async () => {
    const { token, later } = await signedIn();
    await expect(later(MINUTE).authenticate(token)).resolves.toEqual({
      userId: USER,
      organizationId: ORG,
      sessionId: 'session-1',
    });
  });

  it('an unknown token is a 401 that asks to sign in again', async () => {
    const { later } = await signedIn();
    expect(await refusal(later(0).authenticate('not-a-session'))).toEqual({
      code: 'UNAUTHENTICATED',
      message: 'Sign in again.',
    });
  });

  it('within 5 minutes of the last activity, nothing is written', async () => {
    const { token, later, stored } = await signedIn();
    await later(4 * MINUTE).authenticate(token);
    expect(stored()?.lastSeenAt).toEqual(NOW);
  });

  it('7. after more than 5 minutes, activity extends the idle expiry, never the absolute one', async () => {
    const { token, later, stored } = await signedIn();
    await later(6 * MINUTE).authenticate(token);
    expect(stored()?.lastSeenAt).toEqual(new Date(NOW.getTime() + 6 * MINUTE));
    expect(stored()?.idleExpiresAt).toEqual(new Date(NOW.getTime() + 6 * MINUTE + 8 * HOUR));
    expect(stored()?.absoluteExpiresAt).toEqual(new Date(NOW.getTime() + 7 * 24 * HOUR));
  });

  it('7. the idle extension stops at the absolute expiry', async () => {
    const { token, later, stored } = await signedIn({ idleMs: 8 * HOUR, absoluteMs: 10 * HOUR });
    await later(5 * HOUR).authenticate(token);
    expect(stored()?.idleExpiresAt).toEqual(new Date(NOW.getTime() + 10 * HOUR));
  });

  it('7. past the idle expiry the session is refused', async () => {
    const { token, later } = await signedIn();
    expect((await refusal(later(8 * HOUR).authenticate(token))).code).toBe('UNAUTHENTICATED');
  });

  it('6. logout revokes the session; the same token is then refused', async () => {
    const { token, later } = await signedIn();
    await later(MINUTE).logout(token);
    expect((await refusal(later(2 * MINUTE).authenticate(token))).code).toBe('UNAUTHENTICATED');
  });

  it('logout with an unknown token does nothing and does not fail', async () => {
    const { later, stored } = await signedIn();
    await expect(later(0).logout('not-a-session')).resolves.toBeUndefined();
    expect(stored()?.revokedAt).toBeNull();
  });
});

describe('AuthManager.resolveScope (ADR 0051)', () => {
  const session = { userId: 'u1', organizationId: 'o1' };
  const requested = { businessId: 'b1', branchId: 'r1' };

  it('keeps only the permission codes this build knows', async () => {
    const query = new FakeAuthQuery(null);
    query.grant = { roles: ['accountant'], permissions: ['report.profit.view', 'future.code'] };
    const manager = new AuthManager(query, new FakeHasher(), clock, new FakeTokens(), LIFETIMES);
    expect(await manager.resolveScope(session, requested)).toEqual({
      tenant: { organizationId: 'o1', businessIds: ['b1'], branchIds: ['r1'], branchId: 'r1' },
      roles: ['accountant'],
      permissions: ['report.profit.view'],
    });
  });

  it('no grant is 404 NOT_FOUND', async () => {
    const manager = new AuthManager(
      new FakeAuthQuery(null),
      new FakeHasher(),
      clock,
      new FakeTokens(),
      LIFETIMES,
    );
    await expect(manager.resolveScope(session, requested)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

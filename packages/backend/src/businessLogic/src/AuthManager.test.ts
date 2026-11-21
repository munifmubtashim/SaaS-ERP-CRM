import { AppError } from '@erp/shared';
import { describe, expect, it } from 'vitest';
import { AuthManager } from './AuthManager.js';
import type { IAuthQuery, LoginUser } from './contracts/IAuthQuery.js';
import type { IClock } from './contracts/IClock.js';
import type { IPasswordHasher } from './contracts/IPasswordHasher.js';

/**
 * ADR 0018 section 4, steps 2 to 6 without the session (the auth_session table is part 1, not built yet): the
 * same 401 for unknown, locked, inactive and wrong; the dummy-hash cost for unknown and locked users; the lock
 * after 5 failures; the rehash of old hashes. With fakes; the atomic counter is tested in dal.
 */
const NOW = new Date('2026-11-22T06:00:00Z');
const ORG = '01937000-0000-7000-8000-0000000000a0';
const USER = '01937000-0000-7000-8000-0000000000b0';
const clock: IClock = { now: () => NOW };

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
  constructor(private readonly user: LoginUser | null) {}
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
    const manager = new AuthManager(query, new FakeHasher(), clock);
    await expect(manager.verifyLogin('owner@example.com', 'right-password')).resolves.toEqual({
      userId: USER,
      organizationId: ORG,
    });
    expect(query.succeeded).toEqual([{ userId: USER, newHash: null }]);
    expect(query.failed).toEqual([]);
  });

  it('2. unknown user, wrong password, locked user and inactive user all get the same 401 and message', async () => {
    const answers = await Promise.all([
      refusal(
        new AuthManager(new FakeAuthQuery(null), new FakeHasher(), clock).verifyLogin('x@example.com', 'p'),
      ),
      refusal(
        new AuthManager(new FakeAuthQuery(user()), new FakeHasher(), clock).verifyLogin(
          'a@example.com',
          'bad',
        ),
      ),
      refusal(
        new AuthManager(
          new FakeAuthQuery(user({ lockedUntil: new Date(NOW.getTime() + 60_000) })),
          new FakeHasher(),
          clock,
        ).verifyLogin('a@example.com', 'right-password'),
      ),
      refusal(
        new AuthManager(new FakeAuthQuery(user({ isActive: false })), new FakeHasher(), clock).verifyLogin(
          'a@example.com',
          'right-password',
        ),
      ),
    ]);
    for (const answer of answers) expect(answer).toEqual(WRONG);
  });

  it('3. an unknown user still costs one verification, against the dummy hash, and records nothing', async () => {
    const hasher = new FakeHasher();
    const query = new FakeAuthQuery(null);
    await refusal(new AuthManager(query, hasher, clock).verifyLogin('nobody@example.com', 'p'));
    expect(hasher.verified).toEqual(['dummy-hash']);
    expect(query.failed).toEqual([]);
  });

  it('4. a locked user spends the dummy-hash cost, never checks the real hash, and counts nothing', async () => {
    const hasher = new FakeHasher();
    const query = new FakeAuthQuery(user({ lockedUntil: new Date(NOW.getTime() + 60_000) }));
    await refusal(new AuthManager(query, hasher, clock).verifyLogin('a@example.com', 'right-password'));
    expect(hasher.verified).toEqual(['dummy-hash']);
    expect(query.failed).toEqual([]);
    expect(query.succeeded).toEqual([]);
  });

  it('5. a wrong password is recorded once, at the clock time', async () => {
    const query = new FakeAuthQuery(user());
    await refusal(new AuthManager(query, new FakeHasher(), clock).verifyLogin('a@example.com', 'bad'));
    expect(query.failed).toEqual([`${USER}@${NOW.toISOString()}`]);
  });

  it('a lock that has ended lets the right password in', async () => {
    const query = new FakeAuthQuery(user({ lockedUntil: new Date(NOW.getTime() - 1) }));
    await expect(
      new AuthManager(query, new FakeHasher(), clock).verifyLogin('a@example.com', 'right-password'),
    ).resolves.toEqual({ userId: USER, organizationId: ORG });
  });

  it('11. a hash with older settings is replaced after a successful login', async () => {
    const query = new FakeAuthQuery(user());
    await new AuthManager(query, new FakeHasher(false), clock).verifyLogin('a@example.com', 'right-password');
    expect(query.succeeded).toEqual([{ userId: USER, newHash: 'hash:right-password' }]);
  });
});

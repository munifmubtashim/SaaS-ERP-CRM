import { randomUUID } from 'node:crypto';
import { AppError } from '@erp/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { Argon2PasswordHasher } from './Argon2PasswordHasher.js';
import { runDemoSeed } from './demoSeed.js';
import { createManagers, DenyAllRoleSource } from './index.js';
import type { DemoIds } from '@erp/dal';

/**
 * The demo seed end to end, against real Postgres: runDemoSeed hashes the owner's password with
 * Argon2PasswordHasher and seeds the demo organization as the migration owner; then AuthManager.login, built by
 * createManagers exactly as the api builds it, signs the owner in as erp_app. A wrong password and an unknown login
 * give the same 401 (ADR 0018 section 4). Fresh ids and email per run, so the real demo's fixed ids stay untouched.
 */
const appUrl = process.env.DATABASE_URL;
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
if (!appUrl || !ownerUrl)
  throw new Error('DATABASE_URL and MIGRATION_DATABASE_URL must be set (see .env.example).');

const { managers, close } = createManagers({
  databaseUrl: appUrl,
  version: 'test',
  dbPoolMax: 2,
  dbTxTimeoutMs: 10_000,
  roleSource: new DenyAllRoleSource(),
});
const hasher = new Argon2PasswordHasher();

afterAll(async () => {
  await close();
});

const ids: DemoIds = {
  organizationId: randomUUID(),
  legalEntityId: randomUUID(),
  businessId: randomUUID(),
  branchIds: [randomUUID(), randomUUID()],
  ownerUserId: randomUUID(),
  ownerScopeId: randomUUID(),
};
const email = `demo-${randomUUID().slice(0, 8)}@example.com`;
const password = `Pw-${randomUUID()}`;

const refusal = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  return { code: (error as AppError).code, message: (error as AppError).message };
};

describe('runDemoSeed, then login', () => {
  it('seeds twice without error and returns the same organization and owner', async () => {
    const input = {
      migrationDatabaseUrl: ownerUrl,
      ownerEmail: email,
      ownerPassword: password,
      nodeEnv: 'test',
    };
    const first = await runDemoSeed(input, hasher, ids);
    expect(first).toEqual({ organizationId: ids.organizationId, ownerUserId: ids.ownerUserId });
    await expect(runDemoSeed(input, hasher, ids)).resolves.toEqual(first);
  }, 30_000);

  it('the seeded owner logs in through AuthManager.login, by email in any letter case', async () => {
    const outcome = await managers.auth.login(email.toUpperCase(), password, 'Vitest');
    expect(outcome).toMatchObject({ userId: ids.ownerUserId, displayName: 'Demo Owner' });
    expect(outcome.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('a wrong password and an unknown login give the same 401 and message', async () => {
    const wrong = await refusal(managers.auth.login(email, `${password}-wrong`, null));
    const unknown = await refusal(managers.auth.login(`nobody-${randomUUID()}@example.com`, password, null));
    expect(wrong).toEqual({ code: 'UNAUTHENTICATED', message: 'Login or password is wrong.' });
    expect(unknown).toEqual(wrong);
  });

  it('refuses an email without "@" or a short password before writing anything', async () => {
    const other = { ...ids, organizationId: randomUUID(), ownerUserId: randomUUID() };
    await expect(
      runDemoSeed(
        {
          migrationDatabaseUrl: ownerUrl,
          ownerEmail: 'not-an-email',
          ownerPassword: password,
          nodeEnv: 'test',
        },
        hasher,
        other,
      ),
    ).rejects.toThrow(/DEMO_OWNER_EMAIL/);
    await expect(
      runDemoSeed(
        { migrationDatabaseUrl: ownerUrl, ownerEmail: email, ownerPassword: 'short', nodeEnv: 'test' },
        hasher,
        other,
      ),
    ).rejects.toThrow(/DEMO_OWNER_PASSWORD/);
  });

  it('never puts the password into an error message', async () => {
    const secret = `Secret-${randomUUID()}`;
    const error = await runDemoSeed(
      { migrationDatabaseUrl: ownerUrl, ownerEmail: 'not-an-email', ownerPassword: secret, nodeEnv: 'test' },
      hasher,
      ids,
    ).catch((caught: unknown) => caught);
    expect(String((error as Error).message)).not.toContain(secret);
  });
});

describe('runDemoSeed refuses where a known demo login must never go', () => {
  const input = { ownerEmail: email, ownerPassword: password };

  it('refuses with NODE_ENV=production, before writing anything', async () => {
    await expect(
      runDemoSeed({ ...input, migrationDatabaseUrl: ownerUrl, nodeEnv: 'production' }, hasher, ids),
    ).rejects.toThrow(/NODE_ENV=production/);
  });

  it('refuses a database that is not on localhost', async () => {
    const remote = new URL(ownerUrl);
    remote.hostname = 'db.example.com';
    await expect(
      runDemoSeed({ ...input, migrationDatabaseUrl: remote.toString(), nodeEnv: 'development' }, hasher, ids),
    ).rejects.toThrow(/only against a database on localhost/);
  });
});

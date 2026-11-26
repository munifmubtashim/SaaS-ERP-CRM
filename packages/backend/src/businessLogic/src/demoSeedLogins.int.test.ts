import { randomUUID } from 'node:crypto';
import { AppError } from '@erp/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { Argon2PasswordHasher } from './Argon2PasswordHasher.js';
import { runDemoSeed } from './demoSeed.js';
import { createManagers, DenyAllRoleSource } from './index.js';
import type { DemoIds } from '@erp/dal';

/**
 * The four demo logins besides the owner (docs/demo-seed-spec.md sections 1 and 5, ADR 0058 S1): they share
 * DEMO_USERS_PASSWORD, which is validated like the login form, hashed, and never put in an error. Each run here uses
 * a fresh organization and its own .invalid email domain, so it never meets the real demo's logins.
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

const freshIds = (): DemoIds => ({
  organizationId: randomUUID(),
  legalEntityId: randomUUID(),
  businessId: randomUUID(),
  branchIds: [randomUUID(), randomUUID()],
  ownerUserId: randomUUID(),
  ownerScopeId: randomUUID(),
});

const input = (fields: object = {}) => ({
  migrationDatabaseUrl: ownerUrl,
  ownerEmail: `demo-${randomUUID().slice(0, 8)}@example.com`,
  ownerPassword: `Pw-${randomUUID()}`,
  usersPassword: `Users-${randomUUID()}`,
  usersEmailDomain: `t-${randomUUID().slice(0, 8)}.invalid`,
  nodeEnv: 'test',
  ...fields,
});

describe('runDemoSeed: the four logins', () => {
  it('the manager, accounts, service manager and sales logins sign in with DEMO_USERS_PASSWORD', async () => {
    const seedInput = input();
    await runDemoSeed(seedInput, hasher, freshIds());
    for (const name of ['manager', 'accounts', 'service.manager', 'sales']) {
      const outcome = await managers.auth.login(
        `${name}@${seedInput.usersEmailDomain}`,
        seedInput.usersPassword,
        'Vitest',
      );
      expect(outcome.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }
  });

  it('refuses a DEMO_USERS_PASSWORD the login form would refuse, and never echoes it', async () => {
    const ids = freshIds();
    const error = await runDemoSeed(input({ usersPassword: 'short' }), hasher, ids).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('VALIDATION_FAILED');
    expect((error as AppError).message).not.toContain('short');
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from '../config/db.js';
import { AuthQuery } from '../query/AuthQuery.js';
import { createTree, newIds, setScope, type Tree } from './support/orgTree.js';

/**
 * ADR 0018 section 4, the database half of steps 5 and 6: a wrong password counts with one atomic UPDATE (test 5),
 * the fifth sets a 15-minute lock and resets the counter (test 3), and a right password resets the counter and can
 * store a new hash (test 11). Runs as erp_app through AuthQuery, inside the user's own organization.
 */
const appUrl = process.env.DATABASE_URL;
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
if (!appUrl || !ownerUrl)
  throw new Error('DATABASE_URL and MIGRATION_DATABASE_URL must be set (see .env.example).');

const owner: DbClient = createDbClient(ownerUrl, { poolMax: 2, txTimeoutMs: 10_000 });
const app: DbClient = createDbClient(appUrl, { poolMax: 8, txTimeoutMs: 10_000 });
const auth = new AuthQuery(app);
const HASH = '$argon2id$v=19$m=19456,t=2,p=1$dGVzdHNhbHQ$dGVzdGhhc2g'; // not a real password's hash
const NOW = new Date('2026-11-22T06:00:00Z');

let tree: Tree;

beforeAll(async () => {
  tree = await createTree(owner);
});

afterAll(async () => {
  await Promise.all([owner.$disconnect(), app.$disconnect()]);
});

async function addUser(): Promise<{ id: string; organizationId: string; email: string }> {
  const [id] = (await newIds(owner, 1)) as [string];
  const email = `login-${id}@example.com`;
  await owner.$transaction(async (tx) => {
    await setScope(tx, tree.organizationId, [tree.businessId], [tree.branchId]);
    await tx.$executeRaw`
      INSERT INTO app_user (id, organization_id, email, password_hash, display_name)
      VALUES (${id}::uuid, ${tree.organizationId}::uuid, ${email}, ${HASH}, 'Login Test')`;
  });
  return { id, organizationId: tree.organizationId, email };
}

describe('AuthQuery login counters (ADR 0018 section 4)', () => {
  it('5. parallel wrong passwords all count: one atomic UPDATE each, no lost increment', async () => {
    const user = await addUser();
    await Promise.all([1, 2, 3, 4].map(() => auth.recordFailedLogin(user, NOW)));
    expect((await auth.findUserForLogin(user.email))?.failedAttempts).toBe(4);
  });

  it('3. the fifth failure locks the account for 15 minutes and resets the counter', async () => {
    const user = await addUser();
    for (let i = 0; i < 5; i += 1) await auth.recordFailedLogin(user, NOW);
    const found = await auth.findUserForLogin(user.email);
    expect(found?.failedAttempts).toBe(0);
    expect(found?.lockedUntil?.toISOString()).toBe(new Date(NOW.getTime() + 15 * 60_000).toISOString());
  });

  it('5 and 3. five parallel wrong passwords still lock exactly once', async () => {
    const user = await addUser();
    await Promise.all([1, 2, 3, 4, 5].map(() => auth.recordFailedLogin(user, NOW)));
    const found = await auth.findUserForLogin(user.email);
    expect(found?.failedAttempts).toBe(0);
    expect(found?.lockedUntil).not.toBeNull();
  });

  it('6 and 11. a right password resets the counter and the lock, and can store an upgraded hash', async () => {
    const user = await addUser();
    await auth.recordFailedLogin(user, NOW);
    await auth.recordSuccessfulLogin(user, null);
    let found = await auth.findUserForLogin(user.email);
    expect(found).toMatchObject({ failedAttempts: 0, lockedUntil: null, passwordHash: HASH });
    const upgraded = '$argon2id$v=19$m=19456,t=2,p=1$bmV3c2FsdA$bmV3aGFzaA';
    await auth.recordSuccessfulLogin(user, upgraded);
    found = await auth.findUserForLogin(user.email);
    expect(found?.passwordHash).toBe(upgraded);
  });

  it("a counter update names the user's organization: another organization's id changes nothing", async () => {
    const user = await addUser();
    const other = await createTree(owner);
    await auth.recordFailedLogin({ id: user.id, organizationId: other.organizationId }, NOW);
    expect((await auth.findUserForLogin(user.email))?.failedAttempts).toBe(0);
  });
});

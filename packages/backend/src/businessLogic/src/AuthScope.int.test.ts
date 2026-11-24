import { randomUUID } from 'node:crypto';
import { AppError, DEFAULT_ROLE_PERMISSIONS, type RoleCode } from '@erp/shared';
import { createDbClient, seedPermissions, seedSystemRoles } from '@erp/dal';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createManagers, DenyAllRoleSource } from './index.js';

/**
 * ADR 0051 tests 1, 2, 3 and 5, against real Postgres: AuthManager.resolveScope over the real AuthQuery, as erp_app.
 * The request names one business and one branch (X-Business-Id, X-Branch-Id); each is verified, never listed:
 * the business is the user's organization's and active, the branch is that business's and active, and one of the
 * user's active scopes covers both. Anything else, existing or not, is the same 404.
 */
const appUrl = process.env.DATABASE_URL;
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
if (!appUrl || !ownerUrl)
  throw new Error('DATABASE_URL and MIGRATION_DATABASE_URL must be set (see .env.example).');

const { managers, close } = createManagers({
  databaseUrl: appUrl,
  version: 'test',
  dbPoolMax: 4,
  dbTxTimeoutMs: 15_000,
  roleSource: new DenyAllRoleSource(),
});
const owner = createDbClient(ownerUrl, { poolMax: 2, txTimeoutMs: 10_000 });
const HASH = '$argon2id$v=19$m=19456,t=2,p=1$dGVzdHNhbHQ$dGVzdGhhc2g'; // not a real password's hash

interface Org {
  id: string;
  roles: Record<RoleCode, string>;
}
const ids = () => ({ business: randomUUID(), branch: randomUUID(), branch2: randomUUID() });
const a = { org: randomUUID(), legal: randomUUID(), x: ids(), x2: ids(), closed: ids() };
const b = { org: randomUUID(), legal: randomUUID(), y: ids() };
const users = {
  owner: randomUUID(),
  manager: randomUUID(),
  cashier: randomUUID(),
  none: randomUUID(),
  ownerB: randomUUID(),
};

type Tx = Parameters<Parameters<typeof owner.$transaction>[0]>[0];
async function inOrg<T>(org: string, businesses: string[], branches: string[], sql: (tx: Tx) => Promise<T>) {
  return owner.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT set_config('app.organization_id', ${org}, true),
             set_config('app.business_ids', ${businesses.join(',')}, true),
             set_config('app.branch_ids', ${branches.join(',')}, true)`;
    return sql(tx);
  });
}

async function addOrg(org: string, legal: string, businesses: ReturnType<typeof ids>[]): Promise<Org> {
  await inOrg(org, [], [], async (tx) => {
    await tx.$executeRaw`INSERT INTO organization (id, name) VALUES (${org}::uuid, 'Scope Org')`;
    await tx.$executeRaw`
      INSERT INTO legal_entity (id, organization_id, name) VALUES (${legal}::uuid, ${org}::uuid, 'Scope Legal')`;
  });
  for (const [i, x] of businesses.entries()) {
    await inOrg(org, [x.business], [x.branch, x.branch2], async (tx) => {
      await tx.$executeRaw`
        INSERT INTO business (id, organization_id, legal_entity_id, name)
        VALUES (${x.business}::uuid, ${org}::uuid, ${legal}::uuid, ${`Scope Business ${i} ${x.business}`})`;
      await tx.$executeRaw`
        INSERT INTO branch (id, business_id, name, short_code)
        VALUES (${x.branch}::uuid, ${x.business}::uuid, 'Branch One', 'BRA'),
               (${x.branch2}::uuid, ${x.business}::uuid, 'Branch Two', 'BRB')`;
    });
  }
  return { id: org, roles: await seedSystemRoles(owner, org) };
}

async function addUser(
  org: Org,
  user: string,
  scope?: { role: RoleCode; business?: string; branch?: string },
) {
  await inOrg(
    org.id,
    scope?.business ? [scope.business] : [],
    scope?.branch ? [scope.branch] : [],
    async (tx) => {
      await tx.$executeRaw`
      INSERT INTO app_user (id, organization_id, email, password_hash, display_name)
      VALUES (${user}::uuid, ${org.id}::uuid, ${`scope-${user}@example.com`}, ${HASH}, 'Scope User')`;
      if (scope) {
        await tx.$executeRaw`
        INSERT INTO user_scope (user_id, role_id, business_id, branch_id)
        VALUES (${user}::uuid, ${org.roles[scope.role]}::uuid, ${scope.business ?? null}::uuid, ${scope.branch ?? null}::uuid)`;
      }
    },
  );
}

beforeAll(async () => {
  await seedPermissions(owner);
  const orgA = await addOrg(a.org, a.legal, [a.x, a.x2, a.closed]);
  const orgB = await addOrg(b.org, b.legal, [b.y]);
  await inOrg(a.org, [a.closed.business], [a.closed.branch], async (tx) => {
    await tx.$executeRaw`UPDATE business SET is_active = false WHERE id = ${a.closed.business}::uuid`;
  });
  await inOrg(a.org, [a.x2.business], [a.x2.branch2], async (tx) => {
    await tx.$executeRaw`UPDATE branch SET is_active = false WHERE id = ${a.x2.branch2}::uuid`;
  });
  await addUser(orgA, users.owner, { role: 'owner' });
  await addUser(orgA, users.manager, { role: 'business_manager', business: a.x.business });
  await addUser(orgA, users.cashier, { role: 'cashier', business: a.x.business, branch: a.x.branch });
  await addUser(orgA, users.none);
  await addUser(orgB, users.ownerB, { role: 'owner' });
});

afterAll(async () => {
  await Promise.all([close(), owner.$disconnect()]);
});

const sessionOf = (userId: string, organizationId = a.org) => ({
  userId,
  organizationId,
  sessionId: randomUUID(),
});
const resolve = (userId: string, businessId: string, branchId: string, organizationId = a.org) =>
  managers.auth.resolveScope(sessionOf(userId, organizationId), { businessId, branchId });

/** The refusal, so tests can check every 404 is identical. */
async function refusal(work: Promise<unknown>) {
  const error = await work.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  const { code, message, fields } = error as AppError;
  return { code, message, fields };
}

describe('AuthManager.resolveScope (ADR 0051)', () => {
  it('a branch user gets their own branch: the scope, their role and its permissions', async () => {
    expect(await resolve(users.cashier, a.x.business, a.x.branch)).toEqual({
      tenant: {
        organizationId: a.org,
        businessIds: [a.x.business],
        branchIds: [a.x.branch],
        branchId: a.x.branch,
      },
      roles: ['cashier'],
      permissions: [...DEFAULT_ROLE_PERMISSIONS.cashier].sort(),
    });
  });

  it('1. another organization, the same organization without a scope, and a guessed id are the same 404', async () => {
    const otherOrg = await refusal(resolve(users.cashier, b.y.business, b.y.branch));
    const noScope = await refusal(resolve(users.cashier, a.x2.business, a.x2.branch));
    const guessed = await refusal(resolve(users.cashier, randomUUID(), randomUUID()));
    const noRole = await refusal(resolve(users.none, a.x.business, a.x.branch));
    expect(otherOrg).toMatchObject({ code: 'NOT_FOUND' });
    for (const other of [noScope, guessed, noRole]) expect(other).toEqual(otherOrg);
  });

  it("2. a branch user can't use another branch of the same business; a branch of another business is refused too", async () => {
    const notTheirs = await refusal(resolve(users.manager, a.x.business, a.x2.branch));
    expect(notTheirs).toMatchObject({ code: 'NOT_FOUND' });
    await expect(resolve(users.cashier, a.x.business, a.x.branch2)).rejects.toThrow(AppError);
    expect(await refusal(resolve(users.cashier, a.x.business, a.x.branch2))).toEqual(notTheirs);
  });

  it('a business user gets every branch of their business, one per request; an inactive branch is the same 404', async () => {
    for (const branch of [a.x.branch, a.x.branch2]) {
      await expect(resolve(users.manager, a.x.business, branch)).resolves.toMatchObject({
        roles: ['business_manager'],
      });
    }
    const inactive = await refusal(resolve(users.owner, a.x2.business, a.x2.branch2));
    expect(inactive).toEqual(await refusal(resolve(users.manager, randomUUID(), randomUUID())));
  });

  it("3. the group Owner uses every active business of the organization, never another organization's", async () => {
    await expect(resolve(users.owner, a.x.business, a.x.branch)).resolves.toMatchObject({ roles: ['owner'] });
    await expect(resolve(users.owner, a.x2.business, a.x2.branch)).resolves.toMatchObject({
      roles: ['owner'],
    });
    const closed = await refusal(resolve(users.owner, a.closed.business, a.closed.branch));
    const otherOrg = await refusal(resolve(users.owner, b.y.business, b.y.branch));
    expect(closed).toEqual(otherOrg);
    expect(otherOrg).toMatchObject({ code: 'NOT_FOUND' });
    await expect(resolve(users.ownerB, b.y.business, b.y.branch, b.org)).resolves.toMatchObject({
      roles: ['owner'],
    });
  });

  it('5. permissions are the seeded mapping of the role that applies', async () => {
    const owner = await resolve(users.owner, a.x.business, a.x.branch);
    const manager = await resolve(users.manager, a.x.business, a.x.branch);
    expect([...owner.permissions].sort()).toEqual([...DEFAULT_ROLE_PERMISSIONS.owner].sort());
    expect([...manager.permissions].sort()).toEqual([...DEFAULT_ROLE_PERMISSIONS.business_manager].sort());
  });
});

import { randomUUID } from 'node:crypto';
import type { RoleCode } from '@erp/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from '../config/db.js';
import { seedPermissions, seedSystemRoles } from '../prisma/seeds/systemRoles.js';
import { AuthQuery } from '../query/AuthQuery.js';
import { addBranch, addBusiness, createTree, setScope, type Tree } from './support/orgTree.js';
import { policies, rlsState, sourceIsInMigration } from './support/tableRules.js';

/**
 * GET /v1/me/businesses at the database (ADR 0060): the two SELECT-only policies on business and branch that apply
 * only on the "me" path (app.me_user_id set, business and branch ids set to the nil marker), and AuthQuery's read.
 * Every value is invented.
 */
const appUrl = process.env.DATABASE_URL;
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
if (!appUrl || !ownerUrl)
  throw new Error('DATABASE_URL and MIGRATION_DATABASE_URL must be set (see .env.example).');

const owner: DbClient = createDbClient(ownerUrl, { poolMax: 2, txTimeoutMs: 10_000 });
const app: DbClient = createDbClient(appUrl, { poolMax: 2, txTimeoutMs: 10_000 });
/** One connection only, so "the same pooled connection" is guaranteed, not hoped for. */
const single: DbClient = createDbClient(appUrl, { poolMax: 1, txTimeoutMs: 10_000 });
const auth = new AuthQuery(app);
const NIL = '00000000-0000-0000-0000-000000000000';
const HASH = '$argon2id$v=19$m=19456,t=2,p=1$dGVzdHNhbHQ$dGVzdGhhc2g'; // not a real password's hash

let a: Tree; // organization A: business X (branches X1, X1b, inactive X1c), business X2 (X2a), inactive business Z
let b: Tree; // organization B: business Y (Y1)
let x1b: string;
let x1c: string;
let x2: string;
let x2a: string;
let z: string;
let rolesA: Record<RoleCode, string>;
let rolesB: Record<RoleCode, string>;

/** A user of `tree`'s organization with the given scope rows (none: no scope at all). Inserted as the owner. */
async function user(
  tree: Tree,
  roles: Record<RoleCode, string>,
  scopes: { role: RoleCode; business?: string; branch?: string; active?: boolean }[],
): Promise<string> {
  const id = randomUUID();
  await owner.$transaction(async (tx) => {
    const businesses = [tree.businessId, ...scopes.flatMap((s) => (s.business ? [s.business] : []))];
    await setScope(tx, tree.organizationId, businesses, []);
    await tx.$executeRaw`
      INSERT INTO app_user (id, organization_id, email, password_hash, display_name)
      VALUES (${id}::uuid, ${tree.organizationId}::uuid, ${`me-${id}@example.com`}, ${HASH}, 'Me Test User')`;
    for (const scope of scopes) {
      await tx.$executeRaw`
        INSERT INTO user_scope (user_id, role_id, business_id, branch_id, is_active)
        VALUES (${id}::uuid, ${roles[scope.role]}::uuid, ${scope.business ?? null}::uuid,
                ${scope.branch ?? null}::uuid, ${scope.active ?? true})`;
    }
  });
  return id;
}

const ids = (list: { id: string; branches: { id: string }[] }[]) =>
  list.map((business) => ({
    id: business.id,
    branches: business.branches.map((branch) => branch.id).sort(),
  }));

beforeAll(async () => {
  a = await createTree(owner, { businessName: 'Me Test X', shortCode: 'XA' });
  b = await createTree(owner, { businessName: 'Me Test Y', shortCode: 'YA' });
  x1b = await addBranch(owner, a.organizationId, a.businessId, 'XB');
  x1c = await addBranch(owner, a.organizationId, a.businessId, 'XC');
  await owner.$transaction(async (tx) => {
    await setScope(tx, a.organizationId, [a.businessId], [x1c]);
    await tx.$executeRaw`UPDATE branch SET is_active = false WHERE id = ${x1c}::uuid`;
  });
  x2 = await addBusiness(owner, a, 'Me Test X2');
  x2a = await addBranch(owner, a.organizationId, x2, 'XD');
  z = await addBusiness(owner, a, 'Me Test Z (closed)', false);
  await addBranch(owner, a.organizationId, z, 'XE');
  await seedPermissions(owner);
  rolesA = await seedSystemRoles(owner, a.organizationId);
  rolesB = await seedSystemRoles(owner, b.organizationId);
});

afterAll(async () => {
  await Promise.all([owner.$disconnect(), app.$disconnect(), single.$disconnect()]);
});

describe('AuthQuery.myBusinesses (ADR 0060)', () => {
  it('a group Owner sees every active business of the organization with its active branches, nothing inactive', async () => {
    const ownerA = await user(a, rolesA, [{ role: 'owner' }]);
    const list = await auth.myBusinesses(ownerA, a.organizationId);
    expect(ids(list)).toEqual([
      { id: a.businessId, branches: [a.branchId, x1b].sort() },
      { id: x2, branches: [x2a] },
    ]);
    expect(list.flatMap((business) => business.branches.map((branch) => branch.id))).not.toContain(x1c);
    expect(list.map((business) => business.id)).not.toContain(z);
  });

  it('answers only id, name and branches (id, name, short code): no role, cost or other column', async () => {
    const ownerA = await user(a, rolesA, [{ role: 'owner' }]);
    const [first] = await auth.myBusinesses(ownerA, a.organizationId);
    expect(Object.keys(first ?? {}).sort()).toEqual(['branches', 'id', 'name']);
    expect(first?.name).toBe('Me Test X');
    expect(Object.keys(first?.branches[0] ?? {}).sort()).toEqual(['id', 'name', 'shortCode']);
    expect(first?.branches.map((branch) => branch.shortCode)).toEqual(['XA', 'XB']);
  });

  it('a whole-business scope sees that business and all its active branches, no other business', async () => {
    const manager = await user(a, rolesA, [{ role: 'business_manager', business: a.businessId }]);
    expect(ids(await auth.myBusinesses(manager, a.organizationId))).toEqual([
      { id: a.businessId, branches: [a.branchId, x1b].sort() },
    ]);
  });

  it('a branch-only scope sees the business and only its own branch', async () => {
    const cashier = await user(a, rolesA, [{ role: 'cashier', business: a.businessId, branch: x1b }]);
    expect(ids(await auth.myBusinesses(cashier, a.organizationId))).toEqual([
      { id: a.businessId, branches: [x1b] },
    ]);
  });

  it('a user with no scope, or only an inactive one, sees nothing', async () => {
    const none = await user(a, rolesA, []);
    const lapsed = await user(a, rolesA, [{ role: 'business_manager', business: x2, active: false }]);
    expect(await auth.myBusinesses(none, a.organizationId)).toEqual([]);
    expect(await auth.myBusinesses(lapsed, a.organizationId)).toEqual([]);
  });

  it("organization A's Owner never sees organization B, and B's Owner sees only B", async () => {
    const ownerA = await user(a, rolesA, [{ role: 'owner' }]);
    const ownerB = await user(b, rolesB, [{ role: 'owner' }]);
    expect((await auth.myBusinesses(ownerA, a.organizationId)).map((x) => x.id)).not.toContain(b.businessId);
    expect(ids(await auth.myBusinesses(ownerB, b.organizationId))).toEqual([
      { id: b.businessId, branches: [b.branchId] },
    ]);
    // A user named under the wrong organization sees nothing: the scope rows are read inside that organization.
    expect(await auth.myBusinesses(ownerA, b.organizationId)).toEqual([]);
  });
});

describe('the "me" policies never widen a normal business scope (ADR 0060 condition 2)', () => {
  const visible = (tx: Pick<DbClient, '$queryRaw'>) =>
    Promise.all([
      tx.$queryRaw<{ id: string }[]>`SELECT id::text FROM business ORDER BY id`,
      tx.$queryRaw<{ id: string }[]>`SELECT id::text FROM branch ORDER BY id`,
    ]);

  it('a request scoped to business X cannot read business Y rows, though the user may use both', async () => {
    const ownerA = await user(a, rolesA, [{ role: 'owner' }]);
    const [businesses, branches] = await app.$transaction(async (tx) => {
      await setScope(tx, a.organizationId, [a.businessId], [a.branchId]);
      return visible(tx);
    });
    expect(businesses.map((r) => r.id)).toEqual([a.businessId]);
    expect(branches.map((r) => r.id)).toEqual([a.branchId]);

    // Even with app.me_user_id set too, a real business scope switches the "me" policies off.
    const [meBusinesses, meBranches] = await app.$transaction(async (tx) => {
      await setScope(tx, a.organizationId, [a.businessId], [a.branchId]);
      await tx.$queryRaw`SELECT set_config('app.me_user_id', ${ownerA}, true)`;
      return visible(tx);
    });
    expect(meBusinesses.map((r) => r.id)).toEqual([a.businessId]);
    expect(meBranches.map((r) => r.id)).toEqual([a.branchId]);
  });

  it('the nil marker without app.me_user_id shows nothing', async () => {
    const [businesses, branches] = await app.$transaction(async (tx) => {
      await setScope(tx, a.organizationId, [NIL], [NIL]);
      return visible(tx);
    });
    expect(businesses).toEqual([]);
    expect(branches).toEqual([]);
  });

  it('only the marker on both settings opens the path: business marker with a real branch id shows no branch', async () => {
    const ownerA = await user(a, rolesA, [{ role: 'owner' }]);
    const [businesses, branches] = await app.$transaction(async (tx) => {
      await setScope(tx, a.organizationId, [NIL], [x2a]);
      await tx.$queryRaw`SELECT set_config('app.me_user_id', ${ownerA}, true)`;
      return visible(tx);
    });
    expect(businesses).toEqual([]);
    expect(branches).toEqual([]);
  });

  it('a pooled connection returns nothing after the read: an unscoped query raises until settings are set again', async () => {
    const ownerA = await user(a, rolesA, [{ role: 'owner' }]);
    const reader = new AuthQuery(single);
    expect((await reader.myBusinesses(ownerA, a.organizationId)).length).toBeGreaterThan(0);
    const [setting] = await single.$queryRaw<{ me: string | null }[]>`
      SELECT current_setting('app.me_user_id', true) AS me`;
    expect(setting?.me ?? '').toBe('');
    await expect(single.$queryRaw`SELECT id FROM business`).rejects.toThrow(/tenant scope not set/);
    await expect(single.$queryRaw`SELECT id FROM branch`).rejects.toThrow(/tenant scope not set/);
  });
});

describe('the migration keeps the table rules (ADR 0060 condition 3)', () => {
  it('RLS is still enabled and forced on business and branch', async () => {
    expect(await rlsState(owner, 'business')).toEqual([{ enabled: true, forced: true }]);
    expect(await rlsState(owner, 'branch')).toEqual([{ enabled: true, forced: true }]);
  });

  it('the new policies are SELECT only, for erp_app only, and its function is not SECURITY DEFINER', async () => {
    const rows = await owner.$queryRaw<{ name: string; cmd: string; roles: string[]; permissive: string }[]>`
      SELECT policyname AS name, cmd, roles::text[] AS roles, permissive FROM pg_policies
      WHERE policyname IN ('business_app_me_select', 'branch_app_me_select') ORDER BY policyname`;
    expect(rows).toEqual([
      { name: 'branch_app_me_select', cmd: 'SELECT', roles: ['erp_app'], permissive: 'PERMISSIVE' },
      { name: 'business_app_me_select', cmd: 'SELECT', roles: ['erp_app'], permissive: 'PERMISSIVE' },
    ]);
    const [fn] = await owner.$queryRaw<{ definer: boolean }[]>`
      SELECT prosecdef AS definer FROM pg_proc WHERE proname = 'app_me_user_id'`;
    expect(fn).toEqual({ definer: false });
    // The policies that were there before are still there, one per command per role (the "me" ones added).
    expect((await policies(owner, 'business')).filter((p) => p.roles.includes('erp_app')).length).toBe(3);
    expect((await policies(owner, 'branch')).filter((p) => p.roles.includes('erp_app')).length).toBe(3);
  });

  it('the readable SQL source is the migration', () => {
    expect(sourceIsInMigration('sql/rls/me_businesses.sql', 'me_businesses')).toBe(true);
  });
});

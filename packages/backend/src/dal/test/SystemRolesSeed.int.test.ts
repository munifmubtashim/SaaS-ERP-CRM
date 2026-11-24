import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, ROLE_CODES, ROLE_NAMES } from '@erp/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from '../config/db.js';
import { seedPermissions, seedSystemRoles } from '../prisma/seeds/systemRoles.js';
import { createOwnerDatabase, type OwnerDatabase } from './support/ownerDatabase.js';
import { createTree, setScope, type Tree } from './support/orgTree.js';

/**
 * The seed of ADR 0009 part 4: the permission list once, and each organization's five system roles with the
 * default mapping (ADR 0008 section 3, #26's permissions.ts). ADR 0008 tests 8 (exactly five roles per organization,
 * safe to run twice) and 18 (the mapping). It runs as the migration owner through the owner's own forced-RLS
 * policies, with app.organization_id set by set_config(..., true); nothing is ever deleted.
 */
const appUrl = process.env.DATABASE_URL;
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
if (!appUrl || !ownerUrl)
  throw new Error('DATABASE_URL and MIGRATION_DATABASE_URL must be set (see .env.example).');

const owner: DbClient = createDbClient(ownerUrl, { poolMax: 2, txTimeoutMs: 10_000 });
const app: DbClient = createDbClient(appUrl, { poolMax: 2, txTimeoutMs: 10_000 });

let x: Tree;
let y: Tree;

beforeAll(async () => {
  x = await createTree(owner);
  y = await createTree(owner);
});

afterAll(async () => {
  await Promise.all([owner.$disconnect(), app.$disconnect()]);
});

interface RoleRow {
  id: string;
  code: string;
  name: string;
  system: boolean;
}

/** The organization's roles and their active permissions, read as `db` inside that organization. */
async function rolesOf(db: DbClient, tree: Tree) {
  return db.$transaction(async (tx) => {
    await setScope(tx, tree.organizationId, [tree.businessId], [tree.branchId]);
    const roles = await tx.$queryRaw<RoleRow[]>`
      SELECT id::text, code, name, is_system AS system FROM role WHERE organization_id = ${tree.organizationId}::uuid
      ORDER BY code`;
    const mapping = await tx.$queryRaw<{ code: string; permission: string }[]>`
      SELECT r.code, rp.permission_code AS permission FROM role_permission rp JOIN role r ON r.id = rp.role_id
      WHERE r.organization_id = ${tree.organizationId}::uuid AND rp.is_active ORDER BY r.code, rp.permission_code`;
    return { roles, mapping };
  });
}

const expectedMapping = ROLE_CODES.flatMap((code) =>
  [...DEFAULT_ROLE_PERMISSIONS[code]].sort().map((permission) => ({ code, permission })),
).sort((a, b) => a.code.localeCompare(b.code) || a.permission.localeCompare(b.permission));

describe('seedPermissions: the permission list, once', () => {
  it('creates every code in permissions.ts with a description, and a second run changes nothing', async () => {
    await seedPermissions(owner);
    await seedPermissions(owner);
    const rows = await owner.$queryRaw<{ code: string; description: string }[]>`
      SELECT code, description FROM permission WHERE code = ANY (${[...PERMISSIONS]}::text[]) ORDER BY code`;
    expect(rows.map((row) => row.code)).toEqual([...PERMISSIONS].sort());
    for (const row of rows) expect(row.description.length, row.code).toBeGreaterThan(10);
  });
});

describe('seedSystemRoles: ADR 0008 tests 8 and 18', () => {
  it('8. creates exactly the five system roles, with the spec names', async () => {
    await seedPermissions(owner);
    await seedSystemRoles(owner, x.organizationId);
    const { roles } = await rolesOf(owner, x);
    expect(roles.map(({ code, name, system }) => ({ code, name, system }))).toEqual(
      [...ROLE_CODES].sort().map((code) => ({ code, name: ROLE_NAMES[code], system: true })),
    );
  });

  it('18. maps the permissions as permissions.ts says, one row per role and code', async () => {
    const { mapping } = await rolesOf(owner, x);
    expect(mapping).toEqual(expectedMapping);
    expect(mapping).toHaveLength(expectedMapping.length);
  });

  it('8. a second run leaves exactly five roles and the same mappings: nothing added, nothing deleted', async () => {
    const before = await rolesOf(owner, x);
    const ids = await seedSystemRoles(owner, x.organizationId);
    const after = await rolesOf(owner, x);
    expect(after).toEqual(before);
    expect(Object.keys(ids).sort()).toEqual([...ROLE_CODES].sort());
    expect(Object.values(ids).sort()).toEqual(before.roles.map((role) => role.id).sort());
  });

  it("each organization gets its own five roles; seeding one never touches another's", async () => {
    const beforeY = await rolesOf(owner, y);
    expect(beforeY.roles).toEqual([]);
    await seedSystemRoles(owner, y.organizationId);
    const afterY = await rolesOf(owner, y);
    expect(afterY.roles).toHaveLength(5);
    expect(afterY.roles.map((role) => role.id)).not.toContain((await rolesOf(owner, x)).roles[0]?.id);
  });

  it('a custom role already coded like a system role stops the seed with a clear error', async () => {
    const z = await createTree(owner);
    await owner.$transaction(async (tx) => {
      await setScope(tx, z.organizationId, [z.businessId], [z.branchId]);
      await tx.$executeRaw`
        INSERT INTO role (organization_id, code, name, is_system) VALUES (${z.organizationId}::uuid, 'owner', 'Fake', false)`;
    });
    await expect(seedSystemRoles(owner, z.organizationId)).rejects.toThrow(/owner.*is not a system role/);
  });

  it('erp_app cannot run it: system roles are created by the owner only', async () => {
    const z = await createTree(owner);
    await expect(seedSystemRoles(app, z.organizationId)).rejects.toThrow(/row-level security/);
  });
});

describe('the seed through forced RLS, as an owner that is neither superuser nor BYPASSRLS', () => {
  let db: OwnerDatabase;

  beforeAll(async () => {
    db = await createOwnerDatabase(ownerUrl);
  }, 120_000);

  afterAll(async () => {
    await db?.drop();
  }, 60_000);

  it('seeds the permissions and the five roles inside the organization it sets, twice, with the same result', async () => {
    const tree = await createTree(db.client);
    await seedPermissions(db.client);
    await seedSystemRoles(db.client, tree.organizationId);
    const first = await rolesOf(db.client, tree);
    await seedPermissions(db.client);
    await seedSystemRoles(db.client, tree.organizationId);
    expect(await rolesOf(db.client, tree)).toEqual(first);
    expect(first.roles).toHaveLength(5);
    expect(first.mapping).toEqual(expectedMapping);
  });
});

import { readFileSync } from 'node:fs';
import { AppError } from '@erp/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from '../config/db.js';
import { currentClient, runInTenantScope } from '../config/tenantScope.js';
import { AuthQuery } from '../query/AuthQuery.js';
import { DAL_DIR, migrationFolders, migrationSql } from './sqlFunctions.js';
import { addBusiness, createTree, newIds, setScope, type Tree } from './support/orgTree.js';

/**
 * ADR 0009 part 3 (A4): the access tables app_user, role, permission, role_permission and user_scope, with the
 * amendments Munif made on 22 Nov: forced RLS scoped by organization on the four non-catalogue tables, the login
 * path through app.login_key, E.164 phones, fixed system roles, and a create-user conflict that never names the
 * other organization. Also ADR 0008 tests 6 and 9. Fixtures are written as the migration owner inside the scope
 * they set; erp_app's rights are checked directly. Every test uses fresh ids and asserts only on its own rows.
 * The owner policies for a non-superuser owner are in OrganizationTreeOwner.int.test.ts.
 */
const appUrl = process.env.DATABASE_URL;
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
if (!appUrl || !ownerUrl)
  throw new Error('DATABASE_URL and MIGRATION_DATABASE_URL must be set (see .env.example).');

const owner: DbClient = createDbClient(ownerUrl, { poolMax: 4, txTimeoutMs: 10_000 });
const app: DbClient = createDbClient(appUrl, { poolMax: 4, txTimeoutMs: 10_000 });
const auth = new AuthQuery(app);

const RLS_TABLES = ['app_user', 'role', 'role_permission', 'user_scope'] as const;
const TABLES = [...RLS_TABLES, 'permission'] as const;
const HASH = '$argon2id$v=19$m=19456,t=2,p=1$dGVzdHNhbHQ$dGVzdGhhc2g'; // not a real password's hash

let x: Tree;
let y: Tree;

beforeAll(async () => {
  x = await createTree(owner);
  y = await createTree(owner);
});

afterAll(async () => {
  await Promise.all([owner.$disconnect(), app.$disconnect()]);
});

/** A fresh E.164 Bangladeshi mobile number built from a uuid v7's random tail. */
async function freshPhone(): Promise<string> {
  const [id] = (await newIds(owner, 1)) as [string];
  const digits = BigInt(`0x${id.replace(/-/g, '').slice(-12)}`)
    .toString()
    .slice(-8);
  return `+88017${digits}`;
}

/** Runs fn as the owner inside the organization (and first business and branch) of `tree`. */
function asOwner<T>(
  tree: Tree,
  fn: (tx: Parameters<Parameters<DbClient['$transaction']>[0]>[0]) => Promise<T>,
) {
  return owner.$transaction(async (tx) => {
    await setScope(tx, tree.organizationId, [tree.businessId], [tree.branchId]);
    return fn(tx);
  });
}

/** A user in the tree's organization, with a unique email unless one is given. Throws what the database throws. */
async function addUser(
  tree: Tree,
  fields: { email?: string | null; phone?: string | null } = {},
): Promise<string> {
  const [id] = (await newIds(owner, 1)) as [string];
  const email = fields.email === undefined ? `u-${id}@example.com` : fields.email;
  const phone = fields.phone ?? null;
  await asOwner(
    tree,
    (tx) => tx.$executeRaw`
      INSERT INTO app_user (id, organization_id, email, phone, password_hash, display_name)
      VALUES (${id}::uuid, ${tree.organizationId}::uuid, ${email}, ${phone}, ${HASH}, 'Test User')`,
  );
  return id;
}

/** Role codes are unique per organization, so each (organization, code) is created once and then reused. */
const roles = new Map<string, Promise<string>>();

function addRole(tree: Tree, code: string, isSystem = true): Promise<string> {
  const key = `${tree.organizationId}:${code}`;
  const existing = roles.get(key);
  if (existing) return existing;
  const created = (async () => {
    const [id] = (await newIds(owner, 1)) as [string];
    await asOwner(
      tree,
      (tx) => tx.$executeRaw`
        INSERT INTO role (id, organization_id, code, name, is_system)
        VALUES (${id}::uuid, ${tree.organizationId}::uuid, ${code}, ${code}, ${isSystem})`,
    );
    return id;
  })();
  roles.set(key, created);
  return created;
}

/** Inserts a user_scope row as the owner, inside the scope of `scopeTree` (the business check reads under RLS). */
async function addScope(
  scopeTree: Tree,
  row: { userId: string; roleId: string; businessId: string | null; branchId: string | null },
): Promise<string> {
  return asOwner(scopeTree, async (tx) => {
    const [id] = (await newIds(tx, 1)) as [string];
    await tx.$executeRaw`
      INSERT INTO user_scope (id, user_id, role_id, business_id, branch_id)
      VALUES (${id}::uuid, ${row.userId}::uuid, ${row.roleId}::uuid, ${row.businessId}::uuid, ${row.branchId}::uuid)`;
    return id;
  });
}

/** Runs fn as erp_app inside the tenant scope of `tree`, as a request would. */
const asApp = <T>(tree: Tree, fn: () => Promise<T>) =>
  runInTenantScope(
    app,
    { organizationId: tree.organizationId, businessIds: [tree.businessId], branchIds: [tree.branchId] },
    fn,
  );

describe('ADR 0008 test 6: user_scope rules', () => {
  it('an Owner can hold the whole group; a business or branch scope is accepted for any role', async () => {
    const userId = await addUser(x);
    const ownerRole = await addRole(x, 'owner');
    const cashier = await addRole(x, 'cashier');
    await expect(
      addScope(x, { userId, roleId: ownerRole, businessId: null, branchId: null }),
    ).resolves.toBeTypeOf('string');
    await expect(
      addScope(x, { userId, roleId: cashier, businessId: x.businessId, branchId: null }),
    ).resolves.toBeTypeOf('string');
    await expect(
      addScope(x, { userId, roleId: cashier, businessId: x.businessId, branchId: x.branchId }),
    ).resolves.toBeTypeOf('string');
  });

  it('a group scope (both columns null) is refused for a role other than owner', async () => {
    const userId = await addUser(x);
    const manager = await addRole(x, 'business_manager');
    await expect(addScope(x, { userId, roleId: manager, businessId: null, branchId: null })).rejects.toThrow(
      /only the owner role can hold the whole group/,
    );
  });

  it('a group scope is refused for a custom role coded owner (only the system owner role holds the group)', async () => {
    // Farhan, #94: before the seed creates an organization's system roles, erp_app can insert a custom role
    // whose code is 'owner'. It must not get the whole group.
    const z = await createTree(owner);
    const userId = await addUser(z);
    const [customOwner] = (await newIds(owner, 1)) as [string];
    await asApp(z, async () => {
      await expect(
        currentClient().$executeRaw`
          INSERT INTO role (id, organization_id, code, name, is_system)
          VALUES (${customOwner}::uuid, ${z.organizationId}::uuid, 'owner', 'Owner (custom)', false)`,
      ).resolves.toBe(1);
    });
    await expect(
      addScope(z, { userId, roleId: customOwner, businessId: null, branchId: null }),
    ).rejects.toThrow(/only the owner role can hold the whole group/);
    await expect(
      addScope(z, { userId, roleId: customOwner, businessId: z.businessId, branchId: null }),
    ).resolves.toBeTypeOf('string');
  });

  it("a branch scope whose business isn't the branch's business is refused (composite foreign key)", async () => {
    const userId = await addUser(x);
    const cashier = await addRole(x, 'cashier');
    const otherBusiness = await addBusiness(owner, x, `Other ${userId.slice(-8)}`);
    await expect(
      owner.$transaction(async (tx) => {
        await setScope(tx, x.organizationId, [x.businessId, otherBusiness], [x.branchId]);
        await tx.$executeRaw`
          INSERT INTO user_scope (user_id, role_id, business_id, branch_id)
          VALUES (${userId}::uuid, ${cashier}::uuid, ${otherBusiness}::uuid, ${x.branchId}::uuid)`;
      }),
    ).rejects.toThrow(/user_scope_business_id_branch_id_fkey/);
  });

  it('a branch scope without its business is refused (CHECK)', async () => {
    const userId = await addUser(x);
    const cashier = await addRole(x, 'cashier');
    await expect(
      addScope(x, { userId, roleId: cashier, businessId: null, branchId: x.branchId }),
    ).rejects.toThrow(/user_scope_branch_needs_business/);
  });

  it('a role from another organization is refused', async () => {
    const userId = await addUser(x);
    const foreignRole = await addRole(y, 'cashier');
    await expect(
      addScope(x, { userId, roleId: foreignRole, businessId: x.businessId, branchId: null }),
    ).rejects.toThrow(/the role belongs to another organization/);
  });

  it('a business from another organization is refused, even with that business in scope', async () => {
    const userId = await addUser(x);
    const cashier = await addRole(x, 'cashier');
    await expect(
      owner.$transaction(async (tx) => {
        await setScope(tx, y.organizationId, [y.businessId], [y.branchId]);
        await tx.$executeRaw`
          INSERT INTO user_scope (user_id, role_id, business_id)
          VALUES (${userId}::uuid, ${cashier}::uuid, ${y.businessId}::uuid)`;
      }),
    ).rejects.toThrow(/the business belongs to another organization/);
  });

  it('an update to another role is checked again', async () => {
    const userId = await addUser(x);
    const ownerRole = await addRole(x, 'owner');
    const cashier = await addRole(x, 'cashier');
    const scopeId = await addScope(x, { userId, roleId: ownerRole, businessId: null, branchId: null });
    await expect(
      asOwner(
        x,
        (tx) => tx.$executeRaw`UPDATE user_scope SET role_id = ${cashier}::uuid WHERE id = ${scopeId}::uuid`,
      ),
    ).rejects.toThrow(/only the owner role can hold the whole group/);
  });
});

describe('app_user login columns', () => {
  it('email is unique across the system, case-insensitive', async () => {
    const id = await addUser(x);
    await expect(addUser(y, { email: `U-${id}@EXAMPLE.com` })).rejects.toThrow(/app_user_email_ci_key/);
  });

  it('phone is unique across the system', async () => {
    const phone = await freshPhone();
    await addUser(x, { phone });
    await expect(addUser(y, { phone })).rejects.toThrow(/app_user_phone_key/);
  });

  it('phone is stored in E.164 only', async () => {
    for (const phone of [
      '01712345678',
      '+880 1712345678',
      '8801712345678',
      '+0171234567',
      '+880-1712345678',
    ]) {
      await expect(addUser(x, { phone }), phone).rejects.toThrow(/app_user_phone_e164/);
    }
    await expect(addUser(x, { phone: await freshPhone() })).resolves.toBeTypeOf('string');
  });

  it('a user needs an email or a phone', async () => {
    await expect(addUser(x, { email: null, phone: null })).rejects.toThrow(/app_user_login_present/);
    await expect(addUser(x, { email: null, phone: await freshPhone() })).resolves.toBeTypeOf('string');
  });
});

describe('the login lookup (ADR 0018 section 4): app.login_key and nothing wider', () => {
  it('finds a user by email in any letter case, or by phone, before any tenant scope is set', async () => {
    const phone = await freshPhone();
    const id = await addUser(x, { phone });
    const byEmail = await auth.findUserForLogin(` U-${id}@Example.COM `);
    expect(byEmail).toMatchObject({
      id,
      organizationId: x.organizationId,
      passwordHash: HASH,
      failedAttempts: 0,
      displayName: 'Test User',
    });
    expect((await auth.findUserForLogin(phone))?.id).toBe(id);
    expect(await auth.findUserForLogin('nobody-here@example.com')).toBeNull();
  });

  it('with a login key set, app_user shows only the matching row, whatever the query asks', async () => {
    const id = await addUser(x);
    const other = await addUser(y);
    const rows = await app.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.login_key', ${`u-${id}@example.com`}, true)`;
      return tx.$queryRaw<{ id: string }[]>`
        SELECT id::text FROM app_user WHERE id IN (${id}::uuid, ${other}::uuid) OR true`;
    });
    expect(rows).toEqual([{ id }]);
  });

  it('with a login key set, role, role_permission and user_scope still need the organization', async () => {
    // Each table must hold a row: on an empty table PostgreSQL never evaluates the policy, so nothing raises.
    const userId = await addUser(x);
    const roleId = await addRole(x, 'owner');
    await addScope(x, { userId, roleId, businessId: null, branchId: null });
    const [code] = (await newIds(owner, 1)) as [string];
    await owner.$executeRaw`INSERT INTO permission (code, description) VALUES (${`test.${code}`}, 'test')`;
    await asOwner(
      x,
      (tx) => tx.$executeRaw`
      INSERT INTO role_permission (role_id, permission_code) VALUES (${roleId}::uuid, ${`test.${code}`})`,
    );
    for (const table of ['role', 'role_permission', 'user_scope']) {
      const read = app.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('app.login_key', 'someone@example.com', true)`;
        return tx.$queryRawUnsafe(`SELECT 1 FROM ${table} LIMIT 1`);
      });
      await expect(read, table).rejects.toThrow(/tenant scope not set/);
    }
  });

  it('with a login key set, erp_app cannot update the user it found', async () => {
    const id = await addUser(x);
    const update = app.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.login_key', ${`u-${id}@example.com`}, true)`;
      return tx.$executeRaw`UPDATE app_user SET failed_attempts = 1 WHERE id = ${id}::uuid`;
    });
    await expect(update).rejects.toThrow(/tenant scope not set/);
  });

  it('with neither a login key nor a tenant scope, reading app_user fails with "tenant scope not set"', async () => {
    await expect(app.$queryRaw`SELECT id FROM app_user`).rejects.toThrow(/tenant scope not set/);
  });

  it('the login key does not leak to the next transaction on the same connection', async () => {
    const single = createDbClient(appUrl, { poolMax: 1, txTimeoutMs: 10_000 });
    try {
      await single.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('app.login_key', 'someone@example.com', true)`;
      });
      await expect(single.$queryRaw`SELECT id FROM app_user`).rejects.toThrow(/tenant scope not set/);
    } finally {
      await single.$disconnect();
    }
  });
});

describe('creating a user never reveals another organization (Munif, 22 Nov)', () => {
  it('a taken email gives the same 409 whether the other user is in this organization or another', async () => {
    const inX = await addUser(x);
    const inY = await addUser(y);
    const input = (email: string) => ({
      email,
      phone: null,
      passwordHash: HASH,
      displayName: 'New',
      createdBy: null,
    });
    const sameOrg = await auth
      .createUser(x.organizationId, input(`u-${inX}@example.com`))
      .catch((e: unknown) => e);
    const otherOrg = await auth
      .createUser(x.organizationId, input(`U-${inY}@example.com`))
      .catch((e: unknown) => e);
    expect(sameOrg).toBeInstanceOf(AppError);
    expect(otherOrg).toBeInstanceOf(AppError);
    const view = (e: unknown) => {
      const error = e as AppError;
      return { code: error.code, message: error.message, fields: error.fields };
    };
    expect(view(otherOrg)).toEqual(view(sameOrg));
    expect(view(sameOrg)).toEqual({
      code: 'CONFLICT',
      message: 'This email address cannot be used.',
      fields: [{ path: 'email', code: 'user.email_taken', message: 'This email address cannot be used.' }],
    });
    expect(JSON.stringify(view(otherOrg))).not.toContain(y.organizationId);
  });

  it('a taken phone gives the same 409 whether the other user is in this organization or another', async () => {
    const [phoneX, phoneY] = [await freshPhone(), await freshPhone()];
    await addUser(x, { phone: phoneX });
    await addUser(y, { phone: phoneY });
    const input = (phone: string) => ({
      email: null,
      phone,
      passwordHash: HASH,
      displayName: 'New',
      createdBy: null,
    });
    const sameOrg = (await auth
      .createUser(x.organizationId, input(phoneX))
      .catch((e: unknown) => e)) as AppError;
    const otherOrg = (await auth
      .createUser(x.organizationId, input(phoneY))
      .catch((e: unknown) => e)) as AppError;
    expect({ code: otherOrg.code, message: otherOrg.message, fields: otherOrg.fields }).toEqual({
      code: sameOrg.code,
      message: sameOrg.message,
      fields: sameOrg.fields,
    });
    expect(sameOrg.fields).toEqual([
      { path: 'phone', code: 'user.phone_taken', message: 'This phone number cannot be used.' },
    ]);
  });

  it('a new user is created in the given organization', async () => {
    const id = await auth.createUser(x.organizationId, {
      email: null,
      phone: await freshPhone(),
      passwordHash: HASH,
      displayName: 'New',
      createdBy: null,
    });
    const rows = await asOwner(
      x,
      (tx) => tx.$queryRaw<{ org: string }[]>`
      SELECT organization_id::text AS org FROM app_user WHERE id = ${id}::uuid`,
    );
    expect(rows).toEqual([{ org: x.organizationId }]);
  });
});

describe('system roles are fixed (Munif, 22 Nov)', () => {
  it('erp_app cannot rename or deactivate a system role', async () => {
    const roleId = await addRole(x, 'cashier', true);
    await asApp(x, async () => {
      await expect(
        currentClient().$executeRaw`UPDATE role SET name = 'Till' WHERE id = ${roleId}::uuid`,
      ).rejects.toThrow(/a system role cannot be renamed or deactivated/);
    });
    await asApp(x, async () => {
      await expect(
        currentClient().$executeRaw`UPDATE role SET is_active = false WHERE id = ${roleId}::uuid`,
      ).rejects.toThrow(/a system role cannot be renamed or deactivated/);
    });
  });

  it('the owner cannot either, and no role changes code or is_system', async () => {
    const roleId = await addRole(x, 'accountant', true);
    await expect(
      asOwner(x, (tx) => tx.$executeRaw`UPDATE role SET name = 'Books' WHERE id = ${roleId}::uuid`),
    ).rejects.toThrow(/a system role cannot be renamed or deactivated/);
    const custom = await addRole(x, `custom_${roleId.slice(-6)}`, false);
    await expect(
      asOwner(x, (tx) => tx.$executeRaw`UPDATE role SET is_system = true WHERE id = ${custom}::uuid`),
    ).rejects.toThrow(/code, is_system and organization_id cannot change/);
  });

  it('erp_app can rename and deactivate a custom role, but cannot create a system role', async () => {
    const custom = await addRole(x, `custom_${(await newIds(owner, 1))[0]?.slice(-6)}`, false);
    await asApp(x, async () => {
      const db = currentClient();
      await expect(
        db.$executeRaw`UPDATE role SET name = 'Senior Cashier' WHERE id = ${custom}::uuid`,
      ).resolves.toBe(1);
      await expect(
        db.$executeRaw`UPDATE role SET is_active = false WHERE id = ${custom}::uuid`,
      ).resolves.toBe(1);
    });
    await asApp(x, async () => {
      await expect(
        currentClient().$executeRaw`
          INSERT INTO role (organization_id, code, name, is_system) VALUES (${x.organizationId}::uuid, 'fake', 'Fake', true)`,
      ).rejects.toThrow(/row-level security/);
    });
  });

  it("erp_app cannot add a permission to a system role; the owner's seed can", async () => {
    const [code] = (await newIds(owner, 1)) as [string];
    await owner.$executeRaw`INSERT INTO permission (code, description) VALUES (${`test.${code}`}, 'test')`;
    const systemRole = await addRole(x, 'branch_manager', true);
    await asApp(x, async () => {
      await expect(
        currentClient().$executeRaw`
          INSERT INTO role_permission (role_id, permission_code) VALUES (${systemRole}::uuid, ${`test.${code}`})`,
      ).rejects.toThrow(/row-level security/);
    });
    await expect(
      asOwner(
        x,
        (tx) => tx.$executeRaw`
        INSERT INTO role_permission (role_id, permission_code) VALUES (${systemRole}::uuid, ${`test.${code}`})`,
      ),
    ).resolves.toBe(1);
  });
});

describe('role_permission.is_active: a permission leaves a custom role by deactivation (Farhan, #94)', () => {
  /** A permission row on `roleId`, written by the owner's seed path. Returns the permission code. */
  async function grant(roleId: string): Promise<string> {
    const [id] = (await newIds(owner, 1)) as [string];
    const code = `test.${id}`;
    await owner.$executeRaw`INSERT INTO permission (code, description) VALUES (${code}, 'test')`;
    await asOwner(
      x,
      (tx) => tx.$executeRaw`
        INSERT INTO role_permission (role_id, permission_code) VALUES (${roleId}::uuid, ${code})`,
    );
    return code;
  }

  it('a new role_permission row is active', async () => {
    const custom = await addRole(x, `custom_${(await newIds(owner, 1))[0]?.slice(-6)}`, false);
    const code = await grant(custom);
    const rows = await asOwner(
      x,
      (tx) => tx.$queryRaw<{ is_active: boolean }[]>`
        SELECT is_active FROM role_permission WHERE role_id = ${custom}::uuid AND permission_code = ${code}`,
    );
    expect(rows).toEqual([{ is_active: true }]);
  });

  it('erp_app can deactivate and reactivate a permission on a custom role', async () => {
    const custom = await addRole(x, `custom_${(await newIds(owner, 1))[0]?.slice(-6)}`, false);
    const code = await grant(custom);
    await asApp(x, async () => {
      const db = currentClient();
      await expect(
        db.$executeRaw`UPDATE role_permission SET is_active = false
                       WHERE role_id = ${custom}::uuid AND permission_code = ${code}`,
      ).resolves.toBe(1);
      await expect(
        db.$executeRaw`UPDATE role_permission SET is_active = true
                       WHERE role_id = ${custom}::uuid AND permission_code = ${code}`,
      ).resolves.toBe(1);
    });
  });

  it("erp_app cannot change a system role's permissions", async () => {
    const systemRole = await addRole(x, 'stock_keeper', true);
    const code = await grant(systemRole);
    await asApp(x, async () => {
      await expect(
        currentClient().$executeRaw`UPDATE role_permission SET is_active = false
                                    WHERE role_id = ${systemRole}::uuid AND permission_code = ${code}`,
      ).resolves.toBe(0);
    });
  });

  it('erp_app can update is_active only: not the role, the permission or created_at', async () => {
    const custom = await addRole(x, `custom_${(await newIds(owner, 1))[0]?.slice(-6)}`, false);
    const code = await grant(custom);
    for (const assignment of [
      `role_id = role_id`,
      `permission_code = permission_code`,
      `created_at = created_at`,
    ]) {
      await expect(
        app.$executeRawUnsafe(
          `UPDATE role_permission SET ${assignment} WHERE role_id = '${custom}'::uuid AND permission_code = '${code}'`,
        ),
        assignment,
      ).rejects.toThrow(/permission denied/);
    }
  });

  it("in organization Y's scope, erp_app cannot deactivate organization X's permission", async () => {
    const custom = await addRole(x, `custom_${(await newIds(owner, 1))[0]?.slice(-6)}`, false);
    const code = await grant(custom);
    await asApp(y, async () => {
      await expect(
        currentClient().$executeRaw`UPDATE role_permission SET is_active = false
                                    WHERE role_id = ${custom}::uuid AND permission_code = ${code}`,
      ).resolves.toBe(0);
    });
  });
});

describe('erp_app rights and isolation (ADR 0008 tests 9 and 10)', () => {
  it('9. permission is readable and not writable by erp_app', async () => {
    await expect(app.$queryRaw`SELECT code FROM permission LIMIT 1`).resolves.toBeDefined();
    await expect(
      app.$executeRaw`INSERT INTO permission (code, description) VALUES ('test.write', 'x')`,
    ).rejects.toThrow(/permission denied/);
    await expect(app.$executeRaw`UPDATE permission SET description = 'x'`).rejects.toThrow(
      /permission denied/,
    );
  });

  it.each(TABLES)('erp_app cannot DELETE or TRUNCATE %s', async (table) => {
    await expect(app.$executeRawUnsafe(`DELETE FROM ${table} WHERE false`)).rejects.toThrow(
      /permission denied/,
    );
    await expect(app.$executeRawUnsafe(`TRUNCATE ${table}`)).rejects.toThrow(/permission denied/);
  });

  it('erp_app cannot move a user, role or scope to another organization, code, user or role', async () => {
    const userId = await addUser(x);
    const ownerRole = await addRole(x, 'owner');
    const scopeId = await addScope(x, { userId, roleId: ownerRole, businessId: null, branchId: null });
    await expect(
      app.$executeRaw`UPDATE app_user SET organization_id = ${y.organizationId}::uuid WHERE id = ${userId}::uuid`,
    ).rejects.toThrow(/permission denied/);
    await expect(
      app.$executeRaw`UPDATE role SET code = 'cashier' WHERE id = ${ownerRole}::uuid`,
    ).rejects.toThrow(/permission denied/);
    await expect(
      app.$executeRaw`UPDATE user_scope SET user_id = ${userId}::uuid WHERE id = ${scopeId}::uuid`,
    ).rejects.toThrow(/permission denied/);
  });

  it('erp_app can change the login columns and deactivate a scope, inside its organization', async () => {
    const userId = await addUser(x);
    const ownerRole = await addRole(x, 'owner');
    const scopeId = await addScope(x, { userId, roleId: ownerRole, businessId: null, branchId: null });
    await asApp(x, async () => {
      const db = currentClient();
      await expect(
        db.$executeRaw`UPDATE app_user SET failed_attempts = failed_attempts + 1 WHERE id = ${userId}::uuid`,
      ).resolves.toBe(1);
      await expect(
        db.$executeRaw`UPDATE user_scope SET is_active = false WHERE id = ${scopeId}::uuid`,
      ).resolves.toBe(1);
    });
  });

  it("10. in organization X's scope, erp_app sees and changes nothing of organization Y, even by id", async () => {
    const userY = await addUser(y);
    const roleY = await addRole(y, 'owner');
    const scopeY = await addScope(y, { userId: userY, roleId: roleY, businessId: null, branchId: null });
    await asApp(x, async () => {
      const db = currentClient();
      expect(await db.$queryRaw`SELECT id FROM app_user WHERE id = ${userY}::uuid`).toEqual([]);
      expect(await db.$queryRaw`SELECT id FROM role WHERE id = ${roleY}::uuid`).toEqual([]);
      expect(await db.$queryRaw`SELECT id FROM user_scope WHERE id = ${scopeY}::uuid`).toEqual([]);
      expect(await db.$queryRaw`SELECT 1 FROM role_permission WHERE role_id = ${roleY}::uuid`).toEqual([]);
      expect(await db.$executeRaw`UPDATE app_user SET display_name = 'X' WHERE id = ${userY}::uuid`).toBe(0);
      expect(await db.$executeRaw`UPDATE user_scope SET is_active = false WHERE id = ${scopeY}::uuid`).toBe(
        0,
      );
    });
  });
});

describe('RLS is enabled and forced, and the source matches the migration', () => {
  it.each(RLS_TABLES)('%s has ROW LEVEL SECURITY enabled and forced', async (table) => {
    const rows = await owner.$queryRaw<{ enabled: boolean; forced: boolean }[]>`
      SELECT relrowsecurity AS enabled, relforcerowsecurity AS forced FROM pg_class WHERE relname = ${table}
        AND relnamespace = 'public'::regnamespace`;
    expect(rows).toEqual([{ enabled: true, forced: true }]);
  });

  it('permission is a global catalogue: no RLS', async () => {
    const rows = await owner.$queryRaw<{ enabled: boolean }[]>`
      SELECT relrowsecurity AS enabled FROM pg_class WHERE relname = 'permission'
        AND relnamespace = 'public'::regnamespace`;
    expect(rows).toEqual([{ enabled: false }]);
  });

  it('every policy on the access tables names its role, and none is a DELETE policy', async () => {
    const rows = await owner.$queryRaw<{ table: string; cmd: string; roles: string[] }[]>`
      SELECT tablename AS table, cmd, roles::text[] AS roles FROM pg_policies
      WHERE tablename IN ('app_user', 'role', 'role_permission', 'user_scope')`;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.roles, row.table).not.toContain('public');
      expect(row.cmd, row.table).not.toBe('DELETE');
      expect(row.cmd, row.table).not.toBe('ALL');
    }
  });

  it.each(['sql/rls/auth_access.sql', 'sql/triggers/user_scope.sql'])(
    'dal/%s appears, unchanged, in the auth_access migration',
    (file) => {
      const normalise = (sql: string) =>
        sql
          .replace(/--[^\n]*/g, '')
          .replace(/\s+/g, ' ')
          .trim();
      const source = normalise(readFileSync(`${DAL_DIR}${file}`, 'utf8'));
      const folder = migrationFolders().find((name) => name.endsWith('_auth_access'));
      expect(folder, 'an auth_access migration exists').toBeDefined();
      expect(normalise(migrationSql(folder as string))).toContain(source);
    },
  );
});

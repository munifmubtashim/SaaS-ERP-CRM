import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from '../config/db.js';
import { DAL_DIR } from './sqlFunctions.js';
import { createTree, newIds, setScope, type Tree } from './support/orgTree.js';

/**
 * ADR 0009 test cases 6, 9 and 10 for an owner that is neither superuser nor BYPASSRLS (a hosted database such
 * as Neon). The dev and CI owner is a superuser, which skips RLS, so this test makes its own: a throwaway role
 * and a database it owns, then runs every migration as that role. RLS stays forced on it, through its own
 * `TO CURRENT_USER` policies. The role and the database are dropped afterwards (test infrastructure, not rows).
 */
const superUrl = process.env.MIGRATION_DATABASE_URL;
if (!superUrl) throw new Error('MIGRATION_DATABASE_URL must be set (see .env.example).');

const tag = randomBytes(4).toString('hex');
const ROLE = `org_owner_t_${tag}`;
const DATABASE = `erp_owner_t_${tag}`;
const PASSWORD = randomBytes(12).toString('hex');

const urlFor = (user: string, password: string, database: string) => {
  const url = new URL(superUrl);
  url.username = user;
  url.password = password;
  url.pathname = `/${database}`;
  return url.toString();
};

const superuser: DbClient = createDbClient(superUrl, { poolMax: 1, txTimeoutMs: 30_000 });
let roleOwner: DbClient;
let tree: Tree;

beforeAll(async () => {
  await superuser.$executeRawUnsafe(
    `CREATE ROLE ${ROLE} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '${PASSWORD}'`,
  );
  await superuser.$executeRawUnsafe(`CREATE DATABASE ${DATABASE} OWNER ${ROLE}`);
  const roleUrl = urlFor(ROLE, PASSWORD, DATABASE);
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: DAL_DIR,
    env: { ...process.env, MIGRATION_DATABASE_URL: roleUrl },
    stdio: 'pipe',
  });
  roleOwner = createDbClient(roleUrl, { poolMax: 2, txTimeoutMs: 10_000 });
  tree = await createTree(roleOwner);
}, 120_000);

afterAll(async () => {
  await roleOwner?.$disconnect();
  await superuser.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
  await superuser.$executeRawUnsafe(`DROP ROLE IF EXISTS ${ROLE}`);
  await superuser.$disconnect();
}, 60_000);

describe('ADR 0009 cases 6, 9 and 10: an owner that is neither superuser nor BYPASSRLS', () => {
  it('the role really is neither superuser nor BYPASSRLS', async () => {
    const rows = await roleOwner.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
      SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    expect(rows).toEqual([{ rolsuper: false, rolbypassrls: false }]);
  });

  it('6. an insert inside the app.* scope it set succeeds (the fixture helper just did)', () => {
    expect(tree.businessId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('6. an insert outside the scope it set is refused by its own policy', async () => {
    const insert = roleOwner.$transaction(async (tx) => {
      const [outside, other] = (await newIds(tx, 2)) as [string, string];
      await setScope(tx, tree.organizationId, [other], []);
      await tx.$executeRaw`
        INSERT INTO business (id, organization_id, legal_entity_id, name)
        VALUES (${outside}::uuid, ${tree.organizationId}::uuid, ${tree.legalEntityId}::uuid, 'Out Of Scope')`;
    });
    await expect(insert).rejects.toThrow(/row-level security/);
  });

  it('6. an insert with no app.* values set is refused (the scope functions raise)', async () => {
    const insert = roleOwner.$executeRaw`
      INSERT INTO organization (id, name) VALUES (public.uuid_v7(), 'No Scope')`;
    await expect(insert).rejects.toThrow(/tenant scope not set/);
  });

  it('6. a select returns only rows inside the scope it set', async () => {
    const other = await createTree(roleOwner);
    const rows = await roleOwner.$transaction(async (tx) => {
      await setScope(tx, tree.organizationId, [tree.businessId], [tree.branchId]);
      return tx.$queryRaw<{ id: string }[]>`SELECT id::text FROM business`;
    });
    expect(rows).toEqual([{ id: tree.businessId }]);
    expect(other.businessId).not.toBe(tree.businessId);
  });

  it('9. a DELETE removes 0 rows with no error, and the rows are still there', async () => {
    const result = await roleOwner.$transaction(async (tx) => {
      await setScope(tx, tree.organizationId, [tree.businessId], [tree.branchId]);
      const deleted =
        (await tx.$executeRaw`DELETE FROM branch WHERE id = ${tree.branchId}::uuid`) +
        (await tx.$executeRaw`DELETE FROM business WHERE id = ${tree.businessId}::uuid`);
      const left = await tx.$queryRaw<{ n: number }[]>`
        SELECT (SELECT count(*) FROM branch WHERE id = ${tree.branchId}::uuid)::int
             + (SELECT count(*) FROM business WHERE id = ${tree.businessId}::uuid)::int AS n`;
      return { deleted, left: left[0]?.n };
    });
    expect(result).toEqual({ deleted: 0, left: 2 });
  });

  it('10. TRUNCATE is refused for this owner too', async () => {
    const attempt = roleOwner.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('TRUNCATE branch');
      throw new Error('TRUNCATE ran: the trigger is missing (rolled back)');
    });
    await expect(attempt).rejects.toThrow(/TRUNCATE is refused|cannot truncate a table referenced/);
  });
});

describe('auth_access (Munif, 22 Nov): the owner policies on the access tables, for this owner', () => {
  const HASH = '$argon2id$v=19$m=19456,t=2,p=1$dGVzdHNhbHQ$dGVzdGhhc2g'; // not a real password's hash

  it('inserts and reads a user and a role inside the organization it set, and sees no other', async () => {
    const other = await createTree(roleOwner);
    const [userId, roleId, otherUser] = (await roleOwner.$transaction((tx) => newIds(tx, 3))) as [
      string,
      string,
      string,
    ];
    await roleOwner.$transaction(async (tx) => {
      await setScope(tx, other.organizationId, [other.businessId], [other.branchId]);
      await tx.$executeRaw`
        INSERT INTO app_user (id, organization_id, email, password_hash, display_name)
        VALUES (${otherUser}::uuid, ${other.organizationId}::uuid, ${`o-${otherUser}@example.com`}, ${HASH}, 'Other')`;
    });
    const seen = await roleOwner.$transaction(async (tx) => {
      await setScope(tx, tree.organizationId, [tree.businessId], [tree.branchId]);
      await tx.$executeRaw`
        INSERT INTO app_user (id, organization_id, email, password_hash, display_name)
        VALUES (${userId}::uuid, ${tree.organizationId}::uuid, ${`u-${userId}@example.com`}, ${HASH}, 'Owner')`;
      await tx.$executeRaw`
        INSERT INTO role (id, organization_id, code, name, is_system)
        VALUES (${roleId}::uuid, ${tree.organizationId}::uuid, 'owner', 'Owner', true)`;
      await tx.$executeRaw`
        INSERT INTO user_scope (user_id, role_id) VALUES (${userId}::uuid, ${roleId}::uuid)`;
      return tx.$queryRaw<{ id: string }[]>`
        SELECT id::text FROM app_user WHERE id IN (${userId}::uuid, ${otherUser}::uuid)`;
    });
    expect(seen).toEqual([{ id: userId }]);
  });

  it('an insert into another organization than the one it set is refused', async () => {
    const other = await createTree(roleOwner);
    const insert = roleOwner.$transaction(async (tx) => {
      await setScope(tx, tree.organizationId, [tree.businessId], [tree.branchId]);
      await tx.$executeRaw`
        INSERT INTO app_user (organization_id, email, password_hash, display_name)
        VALUES (${other.organizationId}::uuid, 'wrong-org@example.com', ${HASH}, 'Wrong')`;
    });
    await expect(insert).rejects.toThrow(/row-level security/);
  });

  it('with no app.* values set, reading app_user fails with "tenant scope not set"', async () => {
    await expect(roleOwner.$queryRaw`SELECT id FROM app_user`).rejects.toThrow(/tenant scope not set/);
  });

  it('a DELETE removes 0 rows and a TRUNCATE is refused, on each access table', async () => {
    for (const table of ['app_user', 'role', 'role_permission', 'user_scope']) {
      const deleted = await roleOwner.$transaction(async (tx) => {
        await setScope(tx, tree.organizationId, [tree.businessId], [tree.branchId]);
        return tx.$executeRawUnsafe(`DELETE FROM ${table}`);
      });
      expect(deleted, table).toBe(0);
      await expect(roleOwner.$executeRawUnsafe(`TRUNCATE ${table}`), table).rejects.toThrow(
        /TRUNCATE is refused|cannot truncate a table referenced/,
      );
    }
  });
});

import { afterAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from '../config/db.js';

/**
 * ADR 0008 section 1: the provisioning path connects as a separate least-privilege role, erp_provisioner, created
 * by docker/postgres/init/02-provisioner-role.sh. Not the migration owner, not BYPASSRLS, owner of nothing.
 * Its INSERT and SELECT on business and branch come with the organization_tree migration (A3b, test 17); until
 * then it has no table privileges at all. Read through the catalog as the application role.
 */
const appUrl = process.env.DATABASE_URL;
if (!appUrl) throw new Error('DATABASE_URL is not set. Copy .env.example to .env and run npm run docker:up.');

/** Same variable as docker/postgres/init/02-provisioner-role.sh and docker-compose.yml. */
const ROLE = process.env.PROVISIONER_DB_USER || 'erp_provisioner';
const app: DbClient = createDbClient(appUrl, { poolMax: 2, txTimeoutMs: 10_000 });

afterAll(async () => {
  await app.$disconnect();
});

describe('erp_provisioner role (ADR 0008 section 1)', () => {
  it('exists, can log in, and has no superuser, BYPASSRLS, role, database or replication rights', async () => {
    const rows = await app.$queryRaw<
      {
        rolcanlogin: boolean;
        rolsuper: boolean;
        rolbypassrls: boolean;
        rolcreaterole: boolean;
        rolcreatedb: boolean;
        rolreplication: boolean;
      }[]
    >`SELECT rolcanlogin, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolreplication
        FROM pg_roles WHERE rolname = ${ROLE}`;
    expect(rows).toEqual([
      {
        rolcanlogin: true,
        rolsuper: false,
        rolbypassrls: false,
        rolcreaterole: false,
        rolcreatedb: false,
        rolreplication: false,
      },
    ]);
  });

  it('owns no table, view, sequence or function', async () => {
    const owned = await app.$queryRaw<{ name: string }[]>`
      SELECT c.relname AS name FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner WHERE r.rolname = ${ROLE}
      UNION ALL
      SELECT p.proname FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner WHERE r.rolname = ${ROLE}`;
    expect(owned).toEqual([]);
  });

  it('is not a member of any other role, so it inherits nothing', async () => {
    const memberOf = await app.$queryRaw<{ name: string }[]>`
      SELECT g.rolname AS name
        FROM pg_auth_members m
        JOIN pg_roles g ON g.oid = m.roleid
        JOIN pg_roles u ON u.oid = m.member
       WHERE u.rolname = ${ROLE}`;
    expect(memberOf).toEqual([]);
  });

  it('has no table privilege of any kind yet (business and branch grants come with A3b)', async () => {
    const granted = await app.$queryRaw<{ name: string; privilege: string }[]>`
      SELECT c.relname AS name, p.privilege
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'])
               AS p(privilege)
       WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm')
         AND has_table_privilege(${ROLE}, c.oid, p.privilege)`;
    expect(granted).toEqual([]);
  });
});

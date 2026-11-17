import { setTimeout as sleep } from 'node:timers/promises';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppError } from '@erp/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from '../config/db.js';
import { PrismaClient } from '../generated/prisma/client.js';
import { currentClient, runInTenantScope } from './support/tenantScope.spike.js';

/**
 * Proof test for ADR 0005 (tenant transaction scope, Option B). It builds a throwaway RLS table in its own
 * schema as the owner, runs the spike scope runner as the application role, and drops everything afterwards.
 * No migration, no tenant table in the real schema.
 */
const appUrl = process.env.DATABASE_URL;
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
if (!appUrl || !ownerUrl)
  throw new Error('DATABASE_URL and MIGRATION_DATABASE_URL must be set (see .env.example).');

const ORG = '0196f000-0000-7000-8000-00000000000a';
const BIZ_A = '0196f000-0000-7000-8000-0000000000a1';
const BIZ_B = '0196f000-0000-7000-8000-0000000000b1';
const BIZ_C = '0196f000-0000-7000-8000-0000000000c1';

const owner = createDbClient(ownerUrl);
const app: DbClient = createDbClient(appUrl);
/** One connection only, so "the same pooled connection" is guaranteed, not hoped for. */
const singleConnection: DbClient = new PrismaClient({
  adapter: new PrismaPg({ connectionString: appUrl, max: 1 }),
});

interface NoteRow {
  business_id: string;
  body: string;
}

const readNotes = () =>
  currentClient().$queryRaw<NoteRow[]>`SELECT business_id::text, body FROM tenancy_proof.note ORDER BY body`;

beforeAll(async () => {
  const [role] = await app.$queryRaw<{ app_role: string }[]>`SELECT current_user AS app_role`;
  if (!role) throw new Error('could not read the application role');
  const app_role = role.app_role;
  const ddl = [
    'DROP SCHEMA IF EXISTS tenancy_proof CASCADE',
    'CREATE SCHEMA tenancy_proof',
    `GRANT USAGE ON SCHEMA tenancy_proof TO "${app_role}"`,
    // Fails loudly when the scope is missing: an unset value must never mean "all rows" or "no rows".
    `CREATE FUNCTION tenancy_proof.allowed_business_ids() RETURNS uuid[] LANGUAGE plpgsql STABLE AS $$
       DECLARE v text := current_setting('app.business_ids', true);
       BEGIN
         IF v IS NULL OR v = '' THEN
           RAISE EXCEPTION 'tenant scope not set' USING ERRCODE = 'insufficient_privilege';
         END IF;
         RETURN string_to_array(v, ',')::uuid[];
       END $$`,
    `CREATE TABLE tenancy_proof.note (
       id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       business_id uuid NOT NULL,
       body text NOT NULL)`,
    `INSERT INTO tenancy_proof.note (business_id, body) VALUES
       ('${BIZ_A}', 'a-1'), ('${BIZ_A}', 'a-2'), ('${BIZ_B}', 'b-1'), ('${BIZ_C}', 'c-1')`,
    'ALTER TABLE tenancy_proof.note ENABLE ROW LEVEL SECURITY',
    'ALTER TABLE tenancy_proof.note FORCE ROW LEVEL SECURITY',
    `CREATE POLICY note_business ON tenancy_proof.note
       USING (business_id = ANY (tenancy_proof.allowed_business_ids()))
       WITH CHECK (business_id = ANY (tenancy_proof.allowed_business_ids()))`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON tenancy_proof.note TO "${app_role}"`,
  ];
  for (const statement of ddl) await owner.$executeRawUnsafe(statement);
});

afterAll(async () => {
  await owner.$executeRawUnsafe('DROP SCHEMA IF EXISTS tenancy_proof CASCADE');
  await Promise.all([owner.$disconnect(), app.$disconnect(), singleConnection.$disconnect()]);
});

describe('tenant transaction scope (ADR 0005 proof)', () => {
  it('inside the scope, a query sees only rows of the allowed businesses', async () => {
    const onlyA = await runInTenantScope(app, { organizationId: ORG, businessIds: [BIZ_A] }, readNotes);
    expect(onlyA.map((r) => r.body)).toEqual(['a-1', 'a-2']);

    const aAndB = await runInTenantScope(
      app,
      { organizationId: ORG, businessIds: [BIZ_A, BIZ_B] },
      readNotes,
    );
    expect(aAndB.map((r) => r.body)).toEqual(['a-1', 'a-2', 'b-1']);
  });

  it('a Query outside any scope throws a clear AppError', () => {
    expect(() => currentClient()).toThrow(AppError);
    expect(() => currentClient()).toThrow(/tenant scope/i);
  });

  it('SQL with no scope fails in the database: neither all rows nor a silent empty list', async () => {
    await expect(app.$queryRaw`SELECT body FROM tenancy_proof.note`).rejects.toThrow(/tenant scope not set/);
  });

  it('after a request ends, the same pooled connection sees nothing until the values are set again', async () => {
    const inside = await runInTenantScope(
      singleConnection,
      { organizationId: ORG, businessIds: [BIZ_B] },
      async () => {
        const [me] = await currentClient().$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
        return { pid: me?.pid, rows: await readNotes() };
      },
    );
    expect(inside.rows.map((r) => r.body)).toEqual(['b-1']);

    const [after] = await singleConnection.$queryRaw<{ pid: number; ids: string | null }[]>`
      SELECT pg_backend_pid() AS pid, current_setting('app.business_ids', true) AS ids`;
    expect(after?.pid).toBe(inside.pid); // same physical connection
    expect(after?.ids ?? '').toBe(''); // the transaction-local value is gone
    await expect(singleConnection.$queryRaw`SELECT body FROM tenancy_proof.note`).rejects.toThrow(
      /tenant scope not set/,
    );

    const again = await runInTenantScope(
      singleConnection,
      { organizationId: ORG, businessIds: [BIZ_C] },
      readNotes,
    );
    expect(again.map((r) => r.body)).toEqual(['c-1']);
  });

  it('concurrent requests for different businesses never see each other’s rows', async () => {
    const runs = Array.from({ length: 20 }, (_, i) => {
      const business = i % 2 === 0 ? BIZ_A : BIZ_B;
      return runInTenantScope(app, { organizationId: ORG, businessIds: [business] }, async () => {
        await sleep(Math.floor(Math.random() * 15)); // let the other requests interleave
        await currentClient().$executeRaw`SELECT pg_sleep(${Math.random() / 50})`;
        const rows = await readNotes();
        return { business, seen: new Set(rows.map((r) => r.business_id)) };
      });
    });
    for (const { business, seen } of await Promise.all(runs)) {
      expect([...seen]).toEqual([business]);
    }
  });

  it('an error inside the scope rolls back every write', async () => {
    const failing = runInTenantScope(app, { organizationId: ORG, businessIds: [BIZ_A] }, async () => {
      await currentClient().$executeRaw`
        INSERT INTO tenancy_proof.note (business_id, body) VALUES (${BIZ_A}::uuid, 'rollback-1')`;
      await currentClient().$executeRaw`
        INSERT INTO tenancy_proof.note (business_id, body) VALUES (${BIZ_A}::uuid, 'rollback-2')`;
      throw new AppError('CONFLICT', 'simulated failure after two writes');
    });
    await expect(failing).rejects.toThrow('simulated failure after two writes');

    const afterwards = await runInTenantScope(app, { organizationId: ORG, businessIds: [BIZ_A] }, readNotes);
    expect(afterwards.map((r) => r.body)).toEqual(['a-1', 'a-2']);
  });
});

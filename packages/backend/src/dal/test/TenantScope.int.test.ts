import { setTimeout as sleep } from 'node:timers/promises';
import { AppError } from '@erp/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from '../config/db.js';
import { currentClient, runInTenantScope } from '../config/tenantScope.js';
import { BaseQuery } from '../query/BaseQuery.js';

/**
 * Proof test for ADR 0005 (tenant transaction scope, Option B). It builds a throwaway RLS table in its own
 * schema as the owner, runs the real scope runner (config/tenantScope.ts) as the application role, and drops everything afterwards.
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
const BRANCH = '0196f000-0000-7000-8000-0000000001a1';

const owner = createDbClient(ownerUrl, { poolMax: 10, txTimeoutMs: 10_000 });
const app: DbClient = createDbClient(appUrl, { poolMax: 10, txTimeoutMs: 10_000 });
/** One connection only, so "the same pooled connection" is guaranteed, not hoped for. */
const singleConnection: DbClient = createDbClient(appUrl, { poolMax: 1, txTimeoutMs: 10_000 });
/** A 300 ms transaction limit, to show a tenant scope uses the client's limit (DB_TX_TIMEOUT_MS). */
const shortTimeout: DbClient = createDbClient(appUrl, { poolMax: 1, txTimeoutMs: 300 });

interface NoteRow {
  business_id: string;
  body: string;
}

const readNotes = () =>
  currentClient().$queryRaw<NoteRow[]>`SELECT business_id::text, body FROM tenancy_proof.note ORDER BY body`;

/** A tenant Query as modules will write them: it never receives a client, BaseQuery supplies the scoped one. */
class NoteQuery extends BaseQuery {
  async list(): Promise<NoteRow[]> {
    return this.db.$queryRaw<NoteRow[]>`SELECT business_id::text, body FROM tenancy_proof.note ORDER BY body`;
  }
}

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
  await Promise.all([
    owner.$disconnect(),
    app.$disconnect(),
    singleConnection.$disconnect(),
    shortTimeout.$disconnect(),
  ]);
});

describe('tenant transaction scope (ADR 0005 proof)', () => {
  it('inside the scope, a query sees only rows of the allowed businesses', async () => {
    const onlyA = await runInTenantScope(
      app,
      { organizationId: ORG, businessIds: [BIZ_A], branchIds: [BRANCH] },
      readNotes,
    );
    expect(onlyA.map((r) => r.body)).toEqual(['a-1', 'a-2']);

    const aAndB = await runInTenantScope(
      app,
      { organizationId: ORG, businessIds: [BIZ_A, BIZ_B], branchIds: [BRANCH] },
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
      { organizationId: ORG, businessIds: [BIZ_B], branchIds: [BRANCH] },
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
      { organizationId: ORG, businessIds: [BIZ_C], branchIds: [BRANCH] },
      readNotes,
    );
    expect(again.map((r) => r.body)).toEqual(['c-1']);
  });

  it('concurrent requests for different businesses never see each other’s rows', async () => {
    const runs = Array.from({ length: 20 }, (_, i) => {
      const business = i % 2 === 0 ? BIZ_A : BIZ_B;
      return runInTenantScope(
        app,
        { organizationId: ORG, businessIds: [business], branchIds: [BRANCH] },
        async () => {
          await sleep(Math.floor(Math.random() * 15)); // let the other requests interleave
          await currentClient().$executeRaw`SELECT pg_sleep(${Math.random() / 50})`;
          const rows = await readNotes();
          return { business, seen: new Set(rows.map((r) => r.business_id)) };
        },
      );
    });
    for (const { business, seen } of await Promise.all(runs)) {
      expect([...seen]).toEqual([business]);
    }
  });

  it('an error inside the scope rolls back every write', async () => {
    const failing = runInTenantScope(
      app,
      { organizationId: ORG, businessIds: [BIZ_A], branchIds: [BRANCH] },
      async () => {
        await currentClient().$executeRaw`
        INSERT INTO tenancy_proof.note (business_id, body) VALUES (${BIZ_A}::uuid, 'rollback-1')`;
        await currentClient().$executeRaw`
        INSERT INTO tenancy_proof.note (business_id, body) VALUES (${BIZ_A}::uuid, 'rollback-2')`;
        throw new AppError('CONFLICT', 'simulated failure after two writes');
      },
    );
    await expect(failing).rejects.toThrow('simulated failure after two writes');

    const afterwards = await runInTenantScope(
      app,
      { organizationId: ORG, businessIds: [BIZ_A], branchIds: [BRANCH] },
      readNotes,
    );
    expect(afterwards.map((r) => r.body)).toEqual(['a-1', 'a-2']);
  });
});

describe('BaseQuery reads its client from the tenant scope (ADR 0005)', () => {
  it('inside the scope, a tenant Query runs on the scoped transaction', async () => {
    const rows = await runInTenantScope(
      app,
      { organizationId: ORG, businessIds: [BIZ_B], branchIds: [BRANCH] },
      () => new NoteQuery().list(),
    );
    expect(rows.map((r) => r.body)).toEqual(['b-1']);
  });

  it('outside any scope, a tenant Query throws an AppError before reaching the database', async () => {
    await expect(new NoteQuery().list()).rejects.toThrow(AppError);
    await expect(new NoteQuery().list()).rejects.toThrow(/tenant scope/i);
  });

  it('rejects a malformed scope before opening a transaction', async () => {
    const smuggled = { organizationId: ORG, businessIds: [`${BIZ_A},${BIZ_B}`], branchIds: [BRANCH] };
    await expect(runInTenantScope(app, smuggled, readNotes)).rejects.toThrow(AppError);
    const noOrg = { organizationId: 'not-a-uuid', businessIds: [BIZ_A], branchIds: [BRANCH] };
    await expect(runInTenantScope(app, noOrg, readNotes)).rejects.toThrow(AppError);
  });

  it('rejects a scope with no business before opening a transaction', async () => {
    // Otherwise app.business_ids is '' and only the database guard stops it, at the first row it touches.
    const empty = runInTenantScope(
      app,
      { organizationId: ORG, businessIds: [], branchIds: [BRANCH] },
      readNotes,
    );
    await expect(empty).rejects.toThrow(AppError);
    await expect(empty).rejects.toThrow(/Invalid tenant scope/);
  });

  it('rejects a scope with no branch before opening a transaction', async () => {
    // An unset or empty branch list never means "all branches" (ADR 0005).
    const empty = runInTenantScope(
      app,
      { organizationId: ORG, businessIds: [BIZ_A], branchIds: [] },
      readNotes,
    );
    await expect(empty).rejects.toThrow(/Invalid tenant scope/);
  });

  it('a nested scope is forbidden: it throws an AppError instead of opening a second transaction', async () => {
    // One connection: a second transaction could only wait for it, so a quick AppError proves none was opened.
    const nested = runInTenantScope(
      singleConnection,
      { organizationId: ORG, businessIds: [BIZ_A], branchIds: [BRANCH] },
      () =>
        runInTenantScope(
          singleConnection,
          { organizationId: ORG, businessIds: [BIZ_B], branchIds: [BRANCH] },
          readNotes,
        ),
    );
    await expect(nested).rejects.toThrow(AppError);
    await expect(
      runInTenantScope(
        singleConnection,
        { organizationId: ORG, businessIds: [BIZ_A], branchIds: [BRANCH] },
        () =>
          runInTenantScope(
            singleConnection,
            { organizationId: ORG, businessIds: [BIZ_B], branchIds: [BRANCH] },
            readNotes,
          ),
      ),
    ).rejects.toThrow(/nested/i);
  });

  it("uses the client's transaction timeout (DB_TX_TIMEOUT_MS), not a fixed one", async () => {
    const slow = runInTenantScope(
      shortTimeout,
      { organizationId: ORG, businessIds: [BIZ_A], branchIds: [BRANCH] },
      async () => {
        await currentClient().$executeRaw`SELECT pg_sleep(0.6)`;
      },
    );
    // The timeout error itself, so an unrelated failure cannot pass this test (as in DbLimits.int.test.ts).
    await expect(slow).rejects.toThrow(/transaction/i);
  });
});

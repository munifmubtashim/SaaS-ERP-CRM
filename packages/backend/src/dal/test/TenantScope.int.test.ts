import { setTimeout as sleep } from 'node:timers/promises';
import { AppError } from '@erp/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { currentClient, runInTenantScope } from '../config/tenantScope.js';
import { BaseQuery } from '../query/BaseQuery.js';
import {
  BIZ_A,
  BIZ_B,
  BIZ_C,
  connectTestClients,
  createScopedSchema,
  dropSchema,
  inScope,
  ORG,
  protectByBusiness,
} from './support/tenantTestKit.js';

/**
 * Proof test for ADR 0005 (tenant transaction scope, Option B). It builds a throwaway RLS table in its own
 * schema as the owner (support/tenantTestKit.ts), runs the real scope runner (config/tenantScope.ts) as the
 * application role, and drops everything afterwards. No migration, no tenant table in the real schema.
 */
const BRANCH = '0196f000-0000-7000-8000-0000000001a1';

const clients = connectTestClients();
const { owner, app, singleConnection, shortTimeout } = clients;

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
  await createScopedSchema(clients, 'tenancy_proof');
  const ddl = [
    `CREATE TABLE tenancy_proof.note (
       id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       business_id uuid NOT NULL,
       body text NOT NULL)`,
    `INSERT INTO tenancy_proof.note (business_id, body) VALUES
       ('${BIZ_A}', 'a-1'), ('${BIZ_A}', 'a-2'), ('${BIZ_B}', 'b-1'), ('${BIZ_C}', 'c-1')`,
    // Stands in for a deferred check such as the balanced-journal trigger: it fails only at COMMIT.
    `CREATE FUNCTION tenancy_proof.refuse_at_commit() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN RAISE EXCEPTION 'refused at commit'; END $$`,
    `CREATE CONSTRAINT TRIGGER note_refuse_at_commit AFTER INSERT ON tenancy_proof.note
       DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.body = 'fail-at-commit')
       EXECUTE FUNCTION tenancy_proof.refuse_at_commit()`,
  ];
  for (const statement of ddl) await owner.$executeRawUnsafe(statement);
  await protectByBusiness(clients, 'tenancy_proof.note');
});

afterAll(async () => {
  await dropSchema(clients, 'tenancy_proof');
  await clients.disconnect();
});

describe('tenant transaction scope (ADR 0005 proof)', () => {
  it('inside the scope, a query sees only rows of the allowed businesses', async () => {
    const onlyA = await runInTenantScope(
      app,
      { organizationId: ORG, businessIds: [BIZ_A], branchIds: [BRANCH] },
      readNotes,
    );
    expect(onlyA.map((r) => r.body)).toEqual(['a-1', 'a-2']);

    // Several businesses: read-only group routes only (ADR 0005, Q2).
    const aAndB = await runInTenantScope(
      app,
      { organizationId: ORG, businessIds: [BIZ_A, BIZ_B], branchIds: [BRANCH] },
      readNotes,
      { readOnly: true },
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
    await expect(slow).rejects.toThrow();
  });
});

describe('one active business for writes; several only read-only (ADR 0005 Q2)', () => {
  it('rejects a scope with several businesses unless it is read-only', async () => {
    const both = inScope(app, [BIZ_A, BIZ_B], readNotes);
    await expect(both).rejects.toThrow(AppError);
    await expect(both).rejects.toThrow(/read-only/i);
  });

  it('a read-only scope over several businesses reads them all', async () => {
    const rows = await inScope(app, [BIZ_A, BIZ_B], readNotes, { readOnly: true });
    expect(rows.map((r) => r.body)).toEqual(['a-1', 'a-2', 'b-1']);
  });

  it('PostgreSQL refuses a write inside a read-only scope', async () => {
    const write = inScope(
      app,
      [BIZ_A],
      () => currentClient().$executeRaw`
        INSERT INTO tenancy_proof.note (business_id, body) VALUES (${BIZ_A}::uuid, 'read-only-write')`,
      { readOnly: true },
    );
    await expect(write).rejects.toThrow(/read-only transaction/);
    const rows = await inScope(app, [BIZ_A], readNotes);
    expect(rows.map((r) => r.body)).toEqual(['a-1', 'a-2']);
  });
});

describe('a failed commit is a failure (ADR 0005 step 8)', () => {
  it('rejects when the commit fails, even though fn resolved, and keeps no write', async () => {
    let fnResolved = false;
    const run = inScope(app, [BIZ_A], async () => {
      await currentClient().$executeRaw`
        INSERT INTO tenancy_proof.note (business_id, body) VALUES (${BIZ_A}::uuid, 'fail-at-commit')`;
      fnResolved = true;
      return 'handler result';
    });
    await expect(run).rejects.toThrow(/refused at commit/);
    expect(fnResolved).toBe(true);
    const rows = await inScope(app, [BIZ_A], readNotes);
    expect(rows.map((r) => r.body)).toEqual(['a-1', 'a-2']);
  });
});

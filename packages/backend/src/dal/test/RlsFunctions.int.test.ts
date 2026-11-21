import { afterAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from '../config/db.js';
import { currentClient, runInTenantScope } from '../config/tenantScope.js';

/**
 * The RLS policy functions (ADR 0005, migration rls_scope_functions), run as the application role.
 * Every policy calls them, so an unset or empty tenant value must raise, never mean "all rows" or "no rows".
 */
const appUrl = process.env.DATABASE_URL;
if (!appUrl) throw new Error('DATABASE_URL is not set. Copy .env.example to .env and run npm run docker:up.');

const ORG = '0196f000-0000-7000-8000-00000000000a';
const BIZ_A = '0196f000-0000-7000-8000-0000000000a1';
const BIZ_B = '0196f000-0000-7000-8000-0000000000b1';
const BRANCH_A1 = '0196f000-0000-7000-8000-0000000001a1';
const BRANCH_A2 = '0196f000-0000-7000-8000-0000000002a1';

const app: DbClient = createDbClient(appUrl, { poolMax: 10, txTimeoutMs: 10_000 });
/** One connection only, so "the same pooled connection" is guaranteed, not hoped for. */
const singleConnection: DbClient = createDbClient(appUrl, { poolMax: 1, txTimeoutMs: 10_000 });

afterAll(async () => {
  await Promise.all([app.$disconnect(), singleConnection.$disconnect()]);
});

const FUNCTIONS = [
  { fn: 'app_organization_id', setting: 'app.organization_id' },
  { fn: 'app_business_ids', setting: 'app.business_ids' },
  { fn: 'app_branch_ids', setting: 'app.branch_ids' },
] as const;

/** Calls one function by name; the name comes from FUNCTIONS above, never from input. */
const call = (db: Pick<DbClient, '$queryRawUnsafe'>, fn: string) =>
  db.$queryRawUnsafe<{ value: unknown }[]>(`SELECT ${fn}()::text AS value`);

describe('RLS policy functions (ADR 0005)', () => {
  it.each(FUNCTIONS)('$fn() raises when its value was never set', async ({ fn }) => {
    await expect(call(app, fn)).rejects.toThrow(/tenant scope not set/);
  });

  it.each(FUNCTIONS)('$fn() raises when its value is an empty string', async ({ fn, setting }) => {
    const run = app.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config(${setting}, '', true)`;
      return call(tx, fn);
    });
    await expect(run).rejects.toThrow(/tenant scope not set/);
  });

  it('inside a tenant scope, each function returns exactly the values that were set', async () => {
    const scope = { organizationId: ORG, businessIds: [BIZ_A, BIZ_B], branchIds: [BRANCH_A1, BRANCH_A2] };
    const [row] = await runInTenantScope(
      app,
      scope,
      () =>
        currentClient().$queryRaw<{ org: string; businesses: string[]; branches: string[] }[]>`
        SELECT app_organization_id()::text AS org,
               app_business_ids()::text[] AS businesses,
               app_branch_ids()::text[] AS branches`,
      // Several businesses are allowed only read-only (ADR 0005, Q2).
      { readOnly: true },
    );
    expect(row).toEqual({ org: ORG, businesses: [BIZ_A, BIZ_B], branches: [BRANCH_A1, BRANCH_A2] });
  });

  it('after the scope ends, the same pooled connection raises again', async () => {
    const scope = { organizationId: ORG, businessIds: [BIZ_A], branchIds: [BRANCH_A1] };
    const pid = await runInTenantScope(singleConnection, scope, async () => {
      const [me] = await currentClient().$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      return me?.pid;
    });

    const [after] = await singleConnection.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
    expect(after?.pid).toBe(pid); // same physical connection
    for (const { fn } of FUNCTIONS) {
      await expect(call(singleConnection, fn)).rejects.toThrow(/tenant scope not set/);
    }
  });
});

describe('app.branch_id: the branch a write goes to (ADR 0007 step 6)', () => {
  const readBranchId = async () => {
    const [row] = await currentClient().$queryRaw<{ value: string | null }[]>`
      SELECT current_setting('app.branch_id', true) AS value`;
    return row?.value ?? '';
  };

  it('the scope sets app.branch_id to the scope’s branchId', async () => {
    const scope = {
      organizationId: ORG,
      businessIds: [BIZ_A],
      branchIds: [BRANCH_A1, BRANCH_A2],
      branchId: BRANCH_A2,
    };
    expect(await runInTenantScope(app, scope, readBranchId)).toBe(BRANCH_A2);
  });

  it('a scope without branchId leaves app.branch_id empty, never the previous request’s branch', async () => {
    const withBranch = {
      organizationId: ORG,
      businessIds: [BIZ_A],
      branchIds: [BRANCH_A1],
      branchId: BRANCH_A1,
    };
    const withoutBranch = { organizationId: ORG, businessIds: [BIZ_A], branchIds: [BRANCH_A1] };
    expect(await runInTenantScope(singleConnection, withBranch, readBranchId)).toBe(BRANCH_A1);
    expect(await runInTenantScope(singleConnection, withoutBranch, readBranchId)).toBe('');
  });

  it('rejects a branchId outside branchIds before opening a transaction', async () => {
    const scope = { organizationId: ORG, businessIds: [BIZ_A], branchIds: [BRANCH_A1], branchId: BRANCH_A2 };
    await expect(runInTenantScope(app, scope, readBranchId)).rejects.toThrow(/Invalid tenant scope/);
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from '../config/db.js';
import { currentClient, runInTenantScope } from '../config/tenantScope.js';

/**
 * Proof for PARALLEL SAFE on the RLS functions (Farhan, #19). A parallel plan runs part of a query in worker
 * processes. The functions may be marked PARALLEL SAFE only if the transaction's settings (app.business_ids,
 * set with set_config(..., true)) reach those workers. This test forces a parallel plan in which ONLY workers
 * evaluate app_business_ids() (no leader participation): if a worker did not see the setting, it would raise
 * "tenant scope not set" instead of counting rows. Throwaway schema, dropped afterwards.
 */
const appUrl = process.env.DATABASE_URL;
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
if (!appUrl || !ownerUrl)
  throw new Error('DATABASE_URL and MIGRATION_DATABASE_URL must be set (see .env.example).');

const ORG = '0196f000-0000-7000-8000-00000000000a';
const BIZ_A = '0196f000-0000-7000-8000-0000000000a1';
const BIZ_B = '0196f000-0000-7000-8000-0000000000b1';
const BRANCH = '0196f000-0000-7000-8000-0000000001a1';
const ROWS_PER_BUSINESS = 5_000;

const owner: DbClient = createDbClient(ownerUrl, { poolMax: 1, txTimeoutMs: 10_000 });
const app: DbClient = createDbClient(appUrl, { poolMax: 1, txTimeoutMs: 10_000 });

beforeAll(async () => {
  const [role] = await app.$queryRaw<{ name: string }[]>`SELECT current_user AS name`;
  if (!role) throw new Error('could not read the application role');
  const ddl = [
    'DROP SCHEMA IF EXISTS rls_parallel CASCADE',
    'CREATE SCHEMA rls_parallel',
    `GRANT USAGE ON SCHEMA rls_parallel TO "${role.name}"`,
    'CREATE TABLE rls_parallel.row_owner (business_id uuid NOT NULL)',
    `INSERT INTO rls_parallel.row_owner (business_id)
       SELECT CASE WHEN i % 2 = 0 THEN '${BIZ_A}'::uuid ELSE '${BIZ_B}'::uuid END
       FROM generate_series(1, ${2 * ROWS_PER_BUSINESS}) AS i`,
    'ANALYZE rls_parallel.row_owner',
    `GRANT SELECT ON rls_parallel.row_owner TO "${role.name}"`,
  ];
  for (const statement of ddl) await owner.$executeRawUnsafe(statement);
});

afterAll(async () => {
  await owner.$executeRawUnsafe('DROP SCHEMA IF EXISTS rls_parallel CASCADE');
  await Promise.all([owner.$disconnect(), app.$disconnect()]);
});

interface PlanNode {
  'Node Type': string;
  'Workers Launched'?: number;
  Filter?: string;
  Plans?: PlanNode[];
}

const findNode = (node: PlanNode, type: string): PlanNode | undefined =>
  node['Node Type'] === type ? node : node.Plans?.map((child) => findNode(child, type)).find(Boolean);

/** Planner settings for this transaction only: make any parallel plan cheap, and keep the leader out. */
async function forceParallelWorkersOnly(): Promise<void> {
  await currentClient().$queryRaw`
    SELECT set_config('debug_parallel_query', 'on', true),
           set_config('parallel_setup_cost', '0', true),
           set_config('parallel_tuple_cost', '0', true),
           set_config('min_parallel_table_scan_size', '0', true),
           set_config('max_parallel_workers_per_gather', '2', true),
           set_config('parallel_leader_participation', 'off', true)`;
}

describe('RLS functions in parallel workers (PARALLEL SAFE proof)', () => {
  const scope = { organizationId: ORG, businessIds: [BIZ_A], branchIds: [BRANCH] };

  it('workers evaluate app_business_ids() with the transaction’s settings and count only business A', async () => {
    const result = await runInTenantScope(app, scope, async () => {
      await forceParallelWorkersOnly();
      const [explained] = await currentClient().$queryRaw<{ 'QUERY PLAN': [{ Plan: PlanNode }] }[]>`
        EXPLAIN (ANALYZE, FORMAT JSON)
        SELECT count(*) FROM rls_parallel.row_owner WHERE business_id = ANY (public.app_business_ids())`;
      const [counted] = await currentClient().$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM rls_parallel.row_owner WHERE business_id = ANY (public.app_business_ids())`;
      return { plan: explained?.['QUERY PLAN'][0].Plan, count: counted?.n };
    });

    const gather = result.plan && findNode(result.plan, 'Gather');
    expect(gather, 'the planner chose a parallel plan').toBeDefined();
    expect(gather?.['Workers Launched'] ?? 0).toBeGreaterThan(0);
    // The filter that calls the function sits below Gather, so the workers ran it.
    const scan = gather && findNode(gather, 'Seq Scan');
    expect(scan?.Filter).toMatch(/app_business_ids\(\)/);
    expect(result.count).toBe(ROWS_PER_BUSINESS);
  });
});

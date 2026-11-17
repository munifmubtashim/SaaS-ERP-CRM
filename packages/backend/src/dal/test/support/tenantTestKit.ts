import type { TenantScope } from '@erp/shared';
import { createDbClient, type DbClient } from '../../config/db.js';
import { runInTenantScope, type TenantScopeOptions } from '../../config/tenantScope.js';

/**
 * Shared helper for integration tests that run inside a tenant scope (ADR 0005, Q8). Module tests use it
 * instead of copying the proof test's setup. Two clients: `owner` (MIGRATION_DATABASE_URL) builds and drops
 * throwaway schemas; `app` (DATABASE_URL, the erp_app role) runs the code under test. Sample ids only.
 */
export const ORG = '0196f000-0000-7000-8000-00000000000a';
export const BIZ_A = '0196f000-0000-7000-8000-0000000000a1';
export const BIZ_B = '0196f000-0000-7000-8000-0000000000b1';
export const BIZ_C = '0196f000-0000-7000-8000-0000000000c1';
/** Every scope lists its branches explicitly (ADR 0005); the proof table is not branch-scoped. */
export const BRANCH = '0196f000-0000-7000-8000-0000000001a1';

export interface TestClients {
  owner: DbClient;
  app: DbClient;
  /** One connection only, so "the same pooled connection" is guaranteed, not hoped for. */
  singleConnection: DbClient;
  /** A 300 ms transaction limit, to show a tenant scope uses the client's limit (DB_TX_TIMEOUT_MS). */
  shortTimeout: DbClient;
  disconnect(): Promise<void>;
}

export function connectTestClients(): TestClients {
  const appUrl = process.env.DATABASE_URL;
  const ownerUrl = process.env.MIGRATION_DATABASE_URL;
  if (!appUrl || !ownerUrl) {
    throw new Error('DATABASE_URL and MIGRATION_DATABASE_URL must be set (see .env.example).');
  }
  const owner = createDbClient(ownerUrl, { poolMax: 10, txTimeoutMs: 10_000 });
  const app = createDbClient(appUrl, { poolMax: 10, txTimeoutMs: 10_000 });
  const singleConnection = createDbClient(appUrl, { poolMax: 1, txTimeoutMs: 10_000 });
  const shortTimeout = createDbClient(appUrl, { poolMax: 1, txTimeoutMs: 300 });
  return {
    owner,
    app,
    singleConnection,
    shortTimeout,
    disconnect: async () => {
      await Promise.all([
        owner.$disconnect(),
        app.$disconnect(),
        singleConnection.$disconnect(),
        shortTimeout.$disconnect(),
      ]);
    },
  };
}

/** Runs fn in a scope of the sample organization and the given businesses. */
export function inScope<T>(
  db: DbClient,
  businessIds: string[],
  fn: () => Promise<T>,
  options?: TenantScopeOptions,
): Promise<T> {
  const scope: TenantScope = { organizationId: ORG, businessIds, branchIds: [BRANCH] };
  return runInTenantScope(db, scope, fn, options);
}

/**
 * Creates `schema` as the owner with an `allowed_business_ids()` guard that raises when the scope is unset,
 * and grants the app role access. Stands in for the real RLS functions until they ship (1b-iii).
 */
export async function createScopedSchema(clients: TestClients, schema: string): Promise<void> {
  const [role] = await clients.app.$queryRaw<{ name: string }[]>`SELECT current_user AS name`;
  if (!role) throw new Error('could not read the application role');
  const statements = [
    `DROP SCHEMA IF EXISTS ${schema} CASCADE`,
    `CREATE SCHEMA ${schema}`,
    `GRANT USAGE ON SCHEMA ${schema} TO "${role.name}"`,
    // An unset value must never mean "all rows" or "no rows".
    `CREATE FUNCTION ${schema}.allowed_business_ids() RETURNS uuid[] LANGUAGE plpgsql STABLE AS $$
       DECLARE v text := current_setting('app.business_ids', true);
       BEGIN
         IF v IS NULL OR v = '' THEN
           RAISE EXCEPTION 'tenant scope not set' USING ERRCODE = 'insufficient_privilege';
         END IF;
         RETURN string_to_array(v, ',')::uuid[];
       END $$`,
  ];
  for (const statement of statements) await clients.owner.$executeRawUnsafe(statement);
}

/** Enables and forces RLS on a business-owned table, filtered by the guard, and grants it to the app role. */
export async function protectByBusiness(clients: TestClients, table: string): Promise<void> {
  const [role] = await clients.app.$queryRaw<{ name: string }[]>`SELECT current_user AS name`;
  const schema = table.split('.')[0];
  const statements = [
    `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`,
    `CREATE POLICY by_business ON ${table}
       USING (business_id = ANY (${schema}.allowed_business_ids()))
       WITH CHECK (business_id = ANY (${schema}.allowed_business_ids()))`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ${table} TO "${role?.name}"`,
  ];
  for (const statement of statements) await clients.owner.$executeRawUnsafe(statement);
}

export async function dropSchema(clients: TestClients, schema: string): Promise<void> {
  await clients.owner.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
}

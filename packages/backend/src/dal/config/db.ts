import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

/** Limits from ADR 0005. Provisional; measured in Phase 2. The erp_app role timeouts are the primary limits. */
export interface DbClientOptions {
  /** Pool size caps concurrent tenant requests: each holds one connection for its transaction. */
  poolMax?: number;
  /** Prisma's limit on a whole transaction, so on a whole tenant request. */
  txTimeoutMs?: number;
}

/** Time to wait for a free pooled connection before the transaction fails (Prisma's default). */
const TX_MAX_WAIT_MS = 2_000;

/**
 * The Prisma client for the APPLICATION role (DATABASE_URL): NOSUPERUSER, NOBYPASSRLS, owns no table.
 * Never point this at the migration/owner URL.
 *
 * Tenancy rule (roadmap 4.2): once tenant tables exist, every request and job runs in ONE transaction
 * that starts with SET LOCAL app.organization_id / app.business_ids (never plain SET).
 * TODO(Munif, Phase 1): add `withTenantScope(scope, fn)` here; Managers call it, Queries run inside it.
 */
export function createDbClient(
  databaseUrl: string,
  { poolMax = 10, txTimeoutMs = 10_000 }: DbClientOptions = {},
): PrismaClient {
  const adapter = new PrismaPg({ connectionString: databaseUrl, max: poolMax });
  return new PrismaClient({ adapter, transactionOptions: { maxWait: TX_MAX_WAIT_MS, timeout: txTimeoutMs } });
}

export type DbClient = PrismaClient;

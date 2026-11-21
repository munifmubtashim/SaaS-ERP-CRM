import { createDbClient, type DbClient, type DbClientOptions } from './db.js';

/**
 * The Prisma client for erp_provisioner (PROVISIONING_DATABASE_URL; ADR 0008 section 1, ADR 0010): NOSUPERUSER,
 * NOBYPASSRLS, owns nothing, INSERT and SELECT on business and branch only. Same pool and timeout settings as
 * the application client. A lint rule lets only ProvisioningQuery.ts import this file (ADR 0005 named
 * exception), and dal/index.ts never exports it, so no other Query can be handed this connection.
 */
export function createProvisionerClient(provisioningUrl: string, options: DbClientOptions): DbClient {
  return createDbClient(provisioningUrl, options);
}

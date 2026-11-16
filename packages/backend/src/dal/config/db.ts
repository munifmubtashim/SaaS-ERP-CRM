import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

export interface DbClientOptions {
  /** Pool size caps concurrent tenant requests: each holds one connection for its transaction (ADR 0005). */
  poolMax?: number;
}

/**
 * The Prisma client for the APPLICATION role (DATABASE_URL): NOSUPERUSER, NOBYPASSRLS, owns no table.
 * Never point this at the migration/owner URL. Tenant Queries never use it directly: they run inside
 * runInTenantScope (config/tenantScope.ts). Only UnscopedQuery holds it.
 */
export function createDbClient(databaseUrl: string, { poolMax = 10 }: DbClientOptions = {}): PrismaClient {
  const adapter = new PrismaPg({ connectionString: databaseUrl, max: poolMax });
  return new PrismaClient({ adapter });
}

export type DbClient = PrismaClient;

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * The Prisma client for the APPLICATION role (DATABASE_URL): NOSUPERUSER, NOBYPASSRLS, owns no table.
 * Never point this at the migration/owner URL.
 *
 * Tenancy rule (roadmap 4.2): once tenant tables exist, every request and job runs in ONE transaction
 * that starts with SET LOCAL app.organization_id / app.business_ids (never plain SET).
 * TODO(Munif, Phase 1): add `withTenantScope(scope, fn)` here; Managers call it, Queries run inside it.
 */
export function createDbClient(databaseUrl: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}

export type DbClient = PrismaClient;

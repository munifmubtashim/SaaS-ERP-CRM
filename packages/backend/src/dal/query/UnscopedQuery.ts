import type { DbClient } from '../config/db.js';

/**
 * Base for the only Queries that run without a tenant scope (ADR 0005): AuthQuery (login, sessions,
 * the caller's own memberships) and HealthQuery. A lint rule rejects any other importer. Never use it
 * for a table that has business_id.
 */
export abstract class UnscopedQuery {
  constructor(protected readonly db: DbClient) {}
}

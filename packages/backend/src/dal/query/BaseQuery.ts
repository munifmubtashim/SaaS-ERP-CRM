import type { DbClient } from '../config/db.js';

/**
 * Base of every Query: holds the database client, injected by the composition root.
 * TODO(Munif, Phase 1): add the tenant-scope runner here (one transaction with SET LOCAL
 * app.organization_id / app.business_ids) once its ADR is agreed. All tenant queries go through it.
 */
export abstract class BaseQuery {
  constructor(protected readonly db: DbClient) {}
}

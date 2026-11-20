import { currentClient, type TxClient } from '../config/tenantScope.js';

/**
 * Base of every tenant Query (ADR 0005). It receives no client: `db` is the transaction opened by
 * runInTenantScope, so every query runs with the tenant values set. Outside a scope, `db` throws.
 * Auth and Health, which run before or without a tenant, extend UnscopedQuery instead.
 */
export abstract class BaseQuery {
  protected get db(): TxClient {
    return currentClient();
  }
}

import { AppError } from '@erp/shared';
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

  /**
   * For a write that belongs to exactly one business (a number, a product): refuses a scope with several, such as
   * a read-only group route. The write then uses `(SELECT app_business_ids())[1]`.
   */
  protected async requireOneBusiness(what: string): Promise<void> {
    const [scope] = await this.db.$queryRaw<{ businesses: number }[]>`
      SELECT coalesce(array_length((SELECT app_business_ids()), 1), 0)::int AS businesses`;
    if (scope?.businesses !== 1) {
      throw new AppError('INTERNAL_ERROR', `${what} belongs to exactly one business; the scope has several.`);
    }
  }
}

import { AsyncLocalStorage } from 'node:async_hooks';
import { AppError, tenantScopeSchema, type TenantScope } from '@erp/shared';
import type { Prisma } from '../generated/prisma/client.js';
import type { DbClient } from './db.js';

/**
 * Tenant transaction scope (ADR 0005). Every tenant request runs in ONE transaction that first sets
 * app.organization_id and app.business_ids transaction-locally; RLS policies read them. Queries never
 * receive this client: BaseQuery reads it from currentClient().
 */
export type TxClient = Prisma.TransactionClient;

const storage = new AsyncLocalStorage<TxClient>();

/**
 * Opens one transaction, sets the tenant values with bound parameters, and runs fn with the transaction
 * available through currentClient(). Commits when fn resolves, rolls back when it throws. A malformed
 * scope is rejected before any connection is used: an id containing a comma could add a business.
 * Nesting is forbidden: an inner call would open a second transaction on another connection, outside
 * the outer one's commit or rollback.
 */
export function runInTenantScope<T>(db: DbClient, scope: TenantScope, fn: () => Promise<T>): Promise<T> {
  if (storage.getStore()) {
    return Promise.reject(
      new AppError('INTERNAL_ERROR', 'Nested tenant scope: already inside runInTenantScope.'),
    );
  }
  const parsed = tenantScopeSchema.safeParse(scope);
  if (!parsed.success) {
    return Promise.reject(new AppError('INTERNAL_ERROR', 'Invalid tenant scope: ids must be UUIDs.'));
  }
  const { organizationId, businessIds } = parsed.data;
  return db.$transaction(async (tx) => {
    // set_config(name, value, is_local = true) is SET LOCAL with bind parameters (SET LOCAL takes none).
    await tx.$queryRaw`
      SELECT set_config('app.organization_id', ${organizationId}, true),
             set_config('app.business_ids', ${businessIds.join(',')}, true)`;
    return storage.run(tx, fn);
  });
}

/** The scoped transaction. Outside a scope it throws instead of falling back to the shared client. */
export function currentClient(): TxClient {
  const tx = storage.getStore();
  if (!tx) {
    throw new AppError(
      'INTERNAL_ERROR',
      'No tenant scope: this Query ran outside runInTenantScope. Tenant routes and jobs must enter the scope first.',
    );
  }
  return tx;
}

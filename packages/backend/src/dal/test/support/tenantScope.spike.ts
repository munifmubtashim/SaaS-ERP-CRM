import { AsyncLocalStorage } from 'node:async_hooks';
import { AppError } from '@erp/shared';
import type { DbClient } from '../../config/db.js';
import type { Prisma } from '../../generated/prisma/client.js';

/**
 * SPIKE for ADR 0005 (Option B). Lives in test/ on purpose: it proves the mechanism and is not wired into
 * any module. Phase 1 moves it to config/tenantScope.ts and makes BaseQuery read currentClient().
 */
export interface TenantScope {
  organizationId: string;
  businessIds: readonly string[];
}

type TxClient = Prisma.TransactionClient;

const storage = new AsyncLocalStorage<TxClient>();

/** Prisma 7 defaults are maxWait 2000 ms, timeout 5000 ms; ADR 0005 proposes these values. */
const TX_OPTIONS = { maxWait: 2_000, timeout: 10_000 } as const;

/**
 * Opens ONE transaction, sets the tenant values transaction-locally with bound parameters, and runs fn
 * with the transaction client available to every Query through currentClient(). Commits when fn
 * resolves, rolls back when it throws.
 */
export function runInTenantScope<T>(db: DbClient, scope: TenantScope, fn: () => Promise<T>): Promise<T> {
  return db.$transaction(async (tx) => {
    // set_config(name, value, is_local = true) is SET LOCAL with bind parameters (SET LOCAL takes none).
    await tx.$queryRaw`
      SELECT set_config('app.organization_id', ${scope.organizationId}, true),
             set_config('app.business_ids', ${scope.businessIds.join(',')}, true)`;
    return storage.run(tx, fn);
  }, TX_OPTIONS);
}

/** What BaseQuery will call. Outside a scope it throws instead of falling back to the shared client. */
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

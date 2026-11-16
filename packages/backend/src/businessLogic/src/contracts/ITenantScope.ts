import type { TenantScope } from '@erp/shared';

/**
 * Runs work inside one tenant transaction (ADR 0005). Owned here; dal's TenantScopeRunner satisfies it.
 * createManagers exposes it so the api route wrapper can open the scope without importing dal.
 */
export interface ITenantScope {
  run<T>(scope: TenantScope, fn: () => Promise<T>, options?: { readOnly?: boolean }): Promise<T>;
}

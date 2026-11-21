import type { TenantScope } from '@erp/shared';

/**
 * Runs work inside one tenant transaction (ADR 0005). Owned here; dal's TenantScopeRunner satisfies it.
 * createManagers exposes it so the api route wrapper can open the scope without importing dal.
 */
/** The same name as the api's TenantRunOptions (ITenantScopeRunner), so both contracts read alike. */
export interface TenantRunOptions {
  /** Read-only group routes only: the transaction runs READ ONLY and may span several businesses. */
  readOnly?: boolean;
}

export interface ITenantScope {
  run<T>(scope: TenantScope, fn: () => Promise<T>, options?: TenantRunOptions): Promise<T>;
}

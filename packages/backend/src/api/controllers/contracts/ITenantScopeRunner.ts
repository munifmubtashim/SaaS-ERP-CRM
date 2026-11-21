import type { TenantScope } from '@erp/shared';

export interface TenantRunOptions {
  /** Read-only group routes only: the transaction runs READ ONLY and may span several businesses. */
  readOnly?: boolean;
}

/**
 * What the tenant route wrapper needs (ADR 0005 step 2). Owned here (the consumer); the runner from
 * businessLogic's createManagers satisfies it. Commits when fn resolves; rejects on any failure, including
 * a failed commit.
 */
export interface ITenantScopeRunner {
  run<T>(scope: TenantScope, fn: () => Promise<T>, options?: TenantRunOptions): Promise<T>;
}

import { useSyncExternalStore } from 'react';
import { activeScopeStore } from './activeScopeStore';

/**
 * The active business for the customer screens, read from the tab's active scope (activeScopeStore, #12, ADR 0007),
 * which HttpClient also sends as X-Business-Id. Before a scope is chosen it falls back to the first sample business,
 * which the sample party data (MockPartyService) shares with MockOrganizationService.
 */
export const SAMPLE_ACTIVE_BUSINESS_ID = '0196f000-0000-7000-8000-0000000000a1';
/** The sample business's branch, used when a test or the sample picks a business before a branch. Invented. */
const SAMPLE_BRANCH_ID = '0196f000-0000-7000-8000-0000000001a1';

const businessOfScope = (): string => activeScopeStore.get()?.businessId ?? SAMPLE_ACTIVE_BUSINESS_ID;

export const activeBusinessStore = {
  get: businessOfScope,
  /** Picks a business in the active scope, keeping its branch (tests and the sample switcher). */
  set(businessId: string): void {
    activeScopeStore.set({ businessId, branchId: activeScopeStore.get()?.branchId ?? SAMPLE_BRANCH_ID });
  },
  subscribe: (listener: () => void): (() => void) => activeScopeStore.subscribe(listener),
};

/** The business every customer request is for. Part of every party query key (ADR 0007). */
export function useActiveBusinessId(): string {
  return useSyncExternalStore(
    activeBusinessStore.subscribe,
    activeBusinessStore.get,
    activeBusinessStore.get,
  );
}

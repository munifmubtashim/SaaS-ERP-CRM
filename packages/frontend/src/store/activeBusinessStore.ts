import { useSyncExternalStore } from 'react';

/**
 * The active business, until Munif's activeScopeStore (#12, ADR 0007) is merged. It holds one sample business,
 * so the customer screens can be built against mock data now. TODO(Farhan): when #12 merges, delete this file
 * and read the business from activeScopeStore; only useActiveBusinessId and createServices change.
 */
export const SAMPLE_ACTIVE_BUSINESS_ID = '0196f000-0000-7000-8000-0000000000a1';

let current = SAMPLE_ACTIVE_BUSINESS_ID;
const listeners = new Set<() => void>();

export const activeBusinessStore = {
  get: (): string => current,
  set(businessId: string): void {
    current = businessId;
    listeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/** The business every customer request is for. Part of every party query key (ADR 0007). */
export function useActiveBusinessId(): string {
  return useSyncExternalStore(
    activeBusinessStore.subscribe,
    activeBusinessStore.get,
    activeBusinessStore.get,
  );
}

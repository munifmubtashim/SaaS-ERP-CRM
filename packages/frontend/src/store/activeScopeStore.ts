import { activeScopeSchema, type ActiveScope } from '@erp/shared';
import { useSyncExternalStore } from 'react';

/**
 * The business and branch the user is working in (spec O-04). Remembered on this device, so the next visit
 * opens where they left off. Every write uses exactly this business (ADR 0005, Q2). The switcher checks it
 * against the businesses the user may still use.
 */
const KEY = 'erp.activeScope';
const listeners = new Set<() => void>();

function load(): ActiveScope | null {
  try {
    const parsed = activeScopeSchema.safeParse(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

let state: ActiveScope | null = load();

function save(next: ActiveScope | null): void {
  state = next;
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage can be unavailable (private mode); the choice then lasts until reload.
  }
  listeners.forEach((listener) => listener());
}

export const activeScopeStore = {
  get: (): ActiveScope | null => state,
  set: (scope: ActiveScope): void => save(scope),
  clear: (): void => save(null),
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useActiveScope(): ActiveScope | null {
  return useSyncExternalStore(activeScopeStore.subscribe, activeScopeStore.get, activeScopeStore.get);
}

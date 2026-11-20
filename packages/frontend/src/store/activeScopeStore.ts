import { activeScopeSchema, type ActiveScope } from '@erp/shared';
import { useSyncExternalStore } from 'react';

/**
 * The business and branch the user is working in (spec O-04). One per browser tab (ADR 0007), kept in
 * sessionStorage, so two tabs can work in two businesses. The last-used scope, in localStorage, only seeds a
 * new tab. Every write uses exactly this business (ADR 0005, Q2). The switcher checks it against the
 * businesses the user may still use.
 */
const TAB_KEY = 'erp.activeScope';
const LAST_USED_KEY = 'erp.lastUsedScope';
const listeners = new Set<() => void>();

function read(storage: Storage, key: string): ActiveScope | null {
  try {
    const parsed = activeScopeSchema.safeParse(JSON.parse(storage.getItem(key) ?? 'null'));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function write(storage: Storage, key: string, value: ActiveScope | null): void {
  try {
    if (value) storage.setItem(key, JSON.stringify(value));
    else storage.removeItem(key);
  } catch {
    // Storage can be unavailable (private mode); the choice then lasts until reload.
  }
}

let state: ActiveScope | null = read(sessionStorage, TAB_KEY) ?? read(localStorage, LAST_USED_KEY);

function save(next: ActiveScope | null): void {
  state = next;
  write(sessionStorage, TAB_KEY, next);
  write(localStorage, LAST_USED_KEY, next);
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

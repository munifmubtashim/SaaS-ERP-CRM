import { useSyncExternalStore } from 'react';

/**
 * Client-side UI preferences: language, theme, sidebar. Server state lives in TanStack Query, not here.
 * TODO(Munif, Phase 1): persist server-side per user once auth exists (roadmap 4.5).
 */
export interface Preferences {
  locale: 'en' | 'bn';
  theme: 'light' | 'dark';
  sidebarCollapsed: boolean;
}

let state: Preferences = { locale: 'en', theme: 'light', sidebarCollapsed: false };
const listeners = new Set<() => void>();

export const preferencesStore = {
  get: (): Preferences => state,
  set(patch: Partial<Preferences>): void {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function usePreferences(): Preferences {
  return useSyncExternalStore(preferencesStore.subscribe, preferencesStore.get, preferencesStore.get);
}

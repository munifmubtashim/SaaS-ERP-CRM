import { useSyncExternalStore } from 'react';

/**
 * Client-side UI preferences: language, theme, sidebar, density. Server state lives in TanStack Query, not here.
 * TODO(Munif, Phase 1): persist server-side per user once auth exists (roadmap 4.5).
 */
export interface Preferences {
  locale: 'en' | 'bn';
  theme: 'light' | 'dark';
  sidebarCollapsed: boolean;
  /** Card density: compact by default (Munif's review); roomy is the approved design's spacing. No screen sets it yet. */
  density: 'compact' | 'roomy';
}

const DEFAULTS: Preferences = { locale: 'en', theme: 'light', sidebarCollapsed: false, density: 'compact' };
/** localStorage key: preferences are per viewer and per device, a convenience only. */
export const PREFERENCES_KEY = 'erp.preferences';

/** The saved preferences, or the defaults when nothing valid is saved (or storage is blocked). */
export function loadPreferences(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? '{}') as Partial<
      Record<keyof Preferences, unknown>
    >;
    return {
      locale: saved.locale === 'bn' ? 'bn' : DEFAULTS.locale,
      theme: saved.theme === 'dark' ? 'dark' : DEFAULTS.theme,
      sidebarCollapsed: saved.sidebarCollapsed === true,
      density: saved.density === 'roomy' ? 'roomy' : DEFAULTS.density,
    };
  } catch {
    return DEFAULTS;
  }
}

let state: Preferences = loadPreferences();
const listeners = new Set<() => void>();

export const preferencesStore = {
  get: (): Preferences => state,
  set(patch: Partial<Preferences>): void {
    state = { ...state, ...patch };
    try {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(state));
    } catch {
      // Storage blocked (private window): the choice lasts for this page only.
    }
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

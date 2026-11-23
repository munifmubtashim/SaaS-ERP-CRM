import { beforeEach, describe, expect, it } from 'vitest';
import { loadPreferences, preferencesStore, PREFERENCES_KEY } from './preferencesStore';

/** The design's theme toggle and the sidebar remember the choice on this device (localStorage, per viewer). */
describe('preferences are kept on this device', () => {
  beforeEach(() => localStorage.clear());

  it('a change is saved, and loading restores it', () => {
    preferencesStore.set({ theme: 'dark', sidebarCollapsed: true });
    expect(loadPreferences()).toMatchObject({ theme: 'dark', sidebarCollapsed: true });
  });

  it('nothing saved, or something unreadable, gives the defaults', () => {
    expect(loadPreferences()).toEqual({ locale: 'en', theme: 'light', sidebarCollapsed: false });
    localStorage.setItem(PREFERENCES_KEY, '{not json');
    expect(loadPreferences()).toEqual({ locale: 'en', theme: 'light', sidebarCollapsed: false });
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ theme: 'purple', locale: 'fr' }));
    expect(loadPreferences()).toEqual({ locale: 'en', theme: 'light', sidebarCollapsed: false });
  });
});

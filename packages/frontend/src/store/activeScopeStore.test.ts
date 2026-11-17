import type { ActiveScope } from '@erp/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ADR 0007: the active business is per tab (sessionStorage); the last-used one (localStorage) seeds a new tab.
const TAB_KEY = 'erp.activeScope';
const LAST_USED_KEY = 'erp.lastUsedScope';
const scope = (n: number): ActiveScope => ({
  businessId: `0196f000-0000-7000-8000-0000000000${n}1`,
  branchId: `0196f000-0000-7000-8000-0000000000${n}2`,
});

/** A fresh module load stands in for opening the app: in a new tab, or reloading the same tab. */
async function openApp() {
  vi.resetModules();
  return (await import('./activeScopeStore')).activeScopeStore;
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(() => vi.resetModules());

describe('activeScopeStore: one active business per tab (ADR 0007)', () => {
  it('a switch saves the tab value and the last-used value', async () => {
    const store = await openApp();
    store.set(scope(1));
    expect(JSON.parse(sessionStorage.getItem(TAB_KEY) ?? 'null')).toEqual(scope(1));
    expect(JSON.parse(localStorage.getItem(LAST_USED_KEY) ?? 'null')).toEqual(scope(1));
  });

  it('a new tab starts from the last-used business', async () => {
    localStorage.setItem(LAST_USED_KEY, JSON.stringify(scope(2)));
    const store = await openApp();
    expect(store.get()).toEqual(scope(2));
  });

  it("a reload keeps this tab's business, even after another tab switched", async () => {
    sessionStorage.setItem(TAB_KEY, JSON.stringify(scope(1)));
    localStorage.setItem(LAST_USED_KEY, JSON.stringify(scope(2))); // the other tab's later switch
    const store = await openApp();
    expect(store.get()).toEqual(scope(1));
  });

  it("a switch in another tab never changes this tab's business", async () => {
    const thisTab = await openApp();
    thisTab.set(scope(1));
    localStorage.setItem(LAST_USED_KEY, JSON.stringify(scope(2))); // the other tab switches
    expect(thisTab.get()).toEqual(scope(1));
    expect(JSON.parse(sessionStorage.getItem(TAB_KEY) ?? 'null')).toEqual(scope(1));
  });

  it('ignores a stored value that is not a valid scope', async () => {
    sessionStorage.setItem(TAB_KEY, '{"businessId":"not-a-uuid"}');
    localStorage.setItem(LAST_USED_KEY, 'not json');
    const store = await openApp();
    expect(store.get()).toBeNull();
  });

  it('clear forgets the tab value and the last-used value', async () => {
    const store = await openApp();
    store.set(scope(1));
    store.clear();
    expect(store.get()).toBeNull();
    expect(sessionStorage.getItem(TAB_KEY)).toBeNull();
    expect(localStorage.getItem(LAST_USED_KEY)).toBeNull();
  });
});

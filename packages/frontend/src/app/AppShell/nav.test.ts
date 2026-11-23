import { describe, expect, it } from 'vitest';
import { NAV, PHONE_TABS, SIDEBAR } from './nav';

/** The sidebar follows the approved design; only screens that exist get a link (no new routes in the shell PR). */
describe('navigation', () => {
  it('has the design groups and items, in order', () => {
    expect(SIDEBAR.map((group) => [group.key, group.items.map((item) => item.key)])).toEqual([
      ['shell.group.overview', ['shell.nav.home']],
      ['shell.group.organization', ['shell.nav.businesses', 'shell.nav.branches']],
      [
        'shell.group.operations',
        [
          'shell.nav.sales',
          'shell.nav.booking',
          'shell.nav.purchase',
          'shell.nav.inventory',
          'shell.nav.products',
          'shell.nav.service',
        ],
      ],
      ['shell.group.people', ['shell.nav.customers']],
      ['shell.group.finance', ['shell.nav.accounting', 'shell.nav.reports']],
      ['shell.group.admin', ['shell.nav.users']],
    ]);
  });

  it('routes are the nine that exist; the other design items have no link yet', () => {
    expect(NAV.map((item) => item.to)).toEqual([
      '/',
      '/businesses',
      '/sales',
      '/inventory',
      '/products',
      '/customers',
      '/accounting',
      '/reports',
      '/users',
    ]);
    const unlinked = SIDEBAR.flatMap((group) => group.items).filter((item) => item.to === null);
    expect(unlinked.map((item) => item.key)).toEqual([
      'shell.nav.branches',
      'shell.nav.booking',
      'shell.nav.purchase',
      'shell.nav.service',
    ]);
  });

  it('the phone tabs are Home, Sales, Stock, Products and More', () => {
    expect(PHONE_TABS.map((tab) => [tab.key, tab.to])).toEqual([
      ['shell.nav.home', '/'],
      ['shell.nav.sales', '/sales'],
      ['shell.tab.stock', '/inventory'],
      ['shell.nav.products', '/products'],
    ]);
  });
});

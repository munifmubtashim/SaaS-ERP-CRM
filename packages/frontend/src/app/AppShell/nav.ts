import type { MessageKey } from '../../i18n';
import type { IconName } from '../../components/ui';

/** One sidebar entry. `to: null`: in the approved design, but its screen isn't built yet (shown, not a link). */
export interface NavItem {
  to: string | null;
  key: MessageKey;
  icon: IconName;
}

/** The sidebar of the approved design (design/owner-dashboard), in its groups and order. */
export const SIDEBAR: { key: MessageKey; items: NavItem[] }[] = [
  { key: 'shell.group.overview', items: [{ to: '/', key: 'shell.nav.home', icon: 'home' }] },
  {
    key: 'shell.group.organization',
    items: [
      { to: '/businesses', key: 'shell.nav.businesses', icon: 'building' },
      { to: null, key: 'shell.nav.branches', icon: 'pin' },
    ],
  },
  {
    key: 'shell.group.operations',
    items: [
      { to: '/sales', key: 'shell.nav.sales', icon: 'cart' },
      { to: null, key: 'shell.nav.booking', icon: 'cal' },
      { to: null, key: 'shell.nav.purchase', icon: 'bag' },
      { to: '/inventory', key: 'shell.nav.inventory', icon: 'box' },
      { to: '/products', key: 'shell.nav.products', icon: 'bike' },
      { to: null, key: 'shell.nav.service', icon: 'wrench' },
    ],
  },
  { key: 'shell.group.people', items: [{ to: '/customers', key: 'shell.nav.customers', icon: 'users' }] },
  {
    key: 'shell.group.finance',
    items: [
      { to: '/accounting', key: 'shell.nav.accounting', icon: 'book' },
      { to: '/reports', key: 'shell.nav.reports', icon: 'chart' },
    ],
  },
  { key: 'shell.group.admin', items: [{ to: '/users', key: 'shell.nav.users', icon: 'shield' }] },
];

/** The routes the shell links to (the router builds one per item); unbuilt design items have none. */
export const NAV = SIDEBAR.flatMap((group) => group.items).filter(
  (item): item is NavItem & { to: string } => item.to !== null,
);

/** The phone tab bar of the design: Home, Sales, Stock, Products; "More" opens the full menu. */
export const PHONE_TABS: NavItem[] = [
  { to: '/', key: 'shell.nav.home', icon: 'home' },
  { to: '/sales', key: 'shell.nav.sales', icon: 'cart' },
  { to: '/inventory', key: 'shell.tab.stock', icon: 'box' },
  { to: '/products', key: 'shell.nav.products', icon: 'bike' },
];

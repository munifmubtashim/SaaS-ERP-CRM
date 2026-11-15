import type { MessageKey } from '../../i18n';

/** Navigation from the approved design. Each item opens its module's feature folder. */
export const NAV: { to: string; key: MessageKey }[] = [
  { to: '/', key: 'shell.nav.home' },
  { to: '/businesses', key: 'shell.nav.businesses' },
  { to: '/sales', key: 'shell.nav.sales' },
  { to: '/inventory', key: 'shell.nav.inventory' },
  { to: '/customers', key: 'shell.nav.customers' },
  { to: '/accounting', key: 'shell.nav.accounting' },
  { to: '/reports', key: 'shell.nav.reports' },
  { to: '/users', key: 'shell.nav.users' },
];

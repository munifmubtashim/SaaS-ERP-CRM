/**
 * Which services use their sample implementation instead of the API (VITE_DEMO_DATA, agreed with Munif 23 Nov).
 *
 * - A production build never uses sample data, whatever the flag says.
 * - Unset: sample data only for services whose API doesn't exist yet (DEMO_DEFAULT).
 * - "all", "none", or a comma list of service names, e.g. VITE_DEMO_DATA=organization,report.
 *
 * Every figure from a sample service shows the "Demo data" badge (DemoBadge, useDemoData).
 */

/** The report calls, each switched on its own (`report.<call>`); "report" alone means all of them. */
const REPORT_KEYS = [
  'report.ownerDashboard',
  'report.salesToday',
  'report.stockValue',
  'report.customerDues',
  'report.supplierDues',
  'report.salesTarget',
  'report.vatReturn',
  'report.cashPosition',
  'report.monthlyResults',
  'report.bankFeed',
  'report.branchResults',
  'report.customerInsights',
  'report.needsAction',
  'report.dayCloseStatus',
  'report.unitStock',
  'report.kpiTrends',
  'report.cashForecast',
] as const;

/** The sales calls: the POS (catalog and Complete sale, routes built) and the invoices view (no routes yet). */
const SALES_KEYS = ['sales.pos', 'sales.invoices'] as const;

export type DemoService =
  | 'organization'
  | 'sales'
  | 'sales.payments'
  | 'party'
  | 'party.dues'
  | 'inventory'
  | 'product'
  | 'product.catalogue'
  | 'vehicle'
  | (typeof SALES_KEYS)[number]
  | 'sales'
  | 'sales.payments'
  | (typeof REPORT_KEYS)[number];

/** Services that have a sample implementation. A later screen PR adds its service here with its sample. */
export const DEMO_CAPABLE: ReadonlySet<DemoService> = new Set<DemoService>([
  'organization',
  ...SALES_KEYS,
  'sales',
  'sales.payments',
  'party',
  'party.dues',
  'inventory',
  'product',
  'product.catalogue',
  'vehicle',
  ...REPORT_KEYS,
]);

/**
 * No API yet: GET /v1/me/businesses (M2), the invoices view's calls, the stock routes' screens, the model and unit
 * routes (#105, #107), and every report call but the owner dashboard. Real unless named: the owner dashboard (M6,
 * #197) and the POS (sales.pos: GET /v1/stock/pos-catalog #199, POST /v1/invoices #191).
 * No API yet: GET /v1/me/businesses (M2), the POS screen's calls (POST /v1/invoices exists, #191, but the POS service
 * is wired in its own PR), the stock routes' screens, the model and unit routes (#105, #107), and every report call but
 * the owner dashboard. GET /v1/reports/owner-dashboard exists (M6, #197), so it is real unless named.
 * POST /v1/payments (ADR 0057) and the dues route (F5, #220) exist: the payment form pays the real open invoices the
 * dues list, so both are real unless named (ADR 0059 section 4). POS › Invoices pays through `sales`, still sample.
 */
const REAL_BY_DEFAULT: ReadonlySet<DemoService> = new Set<DemoService>([
  'report.ownerDashboard',
  'sales.pos',
]);
export const DEMO_DEFAULT: ReadonlySet<DemoService> = new Set(
  [...DEMO_CAPABLE].filter((service) => !REAL_BY_DEFAULT.has(service)),
  // The owner dashboard (#197) and the customer routes (#209, #216) exist, so they are real unless named.
  [...DEMO_CAPABLE].filter((service) => service !== 'report.ownerDashboard' && service !== 'party'),
  // The owner dashboard (#197), the customer routes (#209, #216) and the product routes (#131) exist, so they are
  // real unless named.
  [...DEMO_CAPABLE].filter(
    (service) =>
      service !== 'report.ownerDashboard' && service !== 'party' && service !== 'product.catalogue',
  ),
  'party',
  'party.dues',
  'product.catalogue',
  'sales.payments',

  // These routes exist, so they are real unless named: the owner dashboard (#197), customers (#209, #216), products
  // (#131), dues (F5, #220) and payments (ADR 0057), which pay the real open invoices that dues list (ADR 0059).
);

export function parseDemoData(
  raw: string | undefined,
  { production }: { production: boolean },
): ReadonlySet<DemoService> {
  if (production) return new Set();
  const value = raw?.trim();
  if (!value) return DEMO_DEFAULT;
  if (value === 'none') return new Set();
  if (value === 'all') return DEMO_CAPABLE;
  const names = value
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
    .flatMap((name) => (name === 'report' ? [...REPORT_KEYS] : name === 'sales' ? [...SALES_KEYS] : [name]));
  for (const name of names) {
    if (!(DEMO_CAPABLE as ReadonlySet<string>).has(name)) {
      throw new Error(
        `VITE_DEMO_DATA names "${name}", which has no sample data. Use "all", "none" or: ${[...DEMO_CAPABLE].join(', ')}.`,
      );
    }
  }
  return new Set(names as DemoService[]);
}

/**
 * The set the app uses (demo-local4, Munif 24 Nov): the chosen one while the api is up; every sample when it is down at
 * start-up, so each screen still shows marked sample data; and never any in a production build.
 */
export function resolveDemoData(
  chosen: ReadonlySet<DemoService>,
  { production, apiUp }: { production: boolean; apiUp: boolean },
): ReadonlySet<DemoService> {
  if (production) return new Set();
  return apiUp ? chosen : DEMO_CAPABLE;
}

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
] as const;

export type DemoService = 'organization' | (typeof REPORT_KEYS)[number];

/** Services that have a sample implementation. A later screen PR adds its service here with its sample. */
export const DEMO_CAPABLE: ReadonlySet<DemoService> = new Set<DemoService>(['organization', ...REPORT_KEYS]);

/** No API yet: GET /v1/me/businesses (M2) and none of the report calls are built. */
export const DEMO_DEFAULT: ReadonlySet<DemoService> = DEMO_CAPABLE;

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
    .flatMap((name) => (name === 'report' ? [...REPORT_KEYS] : [name]));
  for (const name of names) {
    if (!(DEMO_CAPABLE as ReadonlySet<string>).has(name)) {
      throw new Error(
        `VITE_DEMO_DATA names "${name}", which has no sample data. Use "all", "none" or: ${[...DEMO_CAPABLE].join(', ')}.`,
      );
    }
  }
  return new Set(names as DemoService[]);
}

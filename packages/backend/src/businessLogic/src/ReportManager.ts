import { formatMoney, parseMoney, sumMoney, type OwnerDashboard } from '@erp/shared';
import type { IClock } from './contracts/IClock.js';
import type { IReportQuery } from './contracts/IReportQuery.js';

/**
 * Report module: business rules. No Express, no SQL. Owner: Munif.
 *
 * The owner dashboard (ADR 0023 section 2, amended by Munif on 24 Nov): the figures come from the security_invoker
 * view report_owner_dashboard (dal/sql/views/report.sql), so from the ledger only; the totals are the sum of the
 * rows through the shared money helpers; asOf is when the query ran (live figures). Stock value is a cost figure:
 * null in every row and in the totals for a caller without product.cost.view (plan 2.5).
 */
export class ReportManager {
  constructor(
    protected readonly query: IReportQuery,
    private readonly clock: IClock,
  ) {}

  async ownerDashboard(options: { canSeeCost: boolean }): Promise<OwnerDashboard> {
    const rows = await this.query.ownerDashboard();
    const total = (pick: (row: (typeof rows)[number]) => string) =>
      formatMoney(sumMoney(rows.map((row) => parseMoney(pick(row)))));
    return {
      asOf: this.clock.now().toISOString(),
      totals: {
        dues: total((r) => r.dues),
        collectionsToday: total((r) => r.collectionsToday),
        revenueMonth: total((r) => r.revenueMonth),
        stockValue: options.canSeeCost ? total((r) => r.stockValue) : null,
      },
      businesses: rows.map((row) => ({
        businessId: row.businessId,
        name: row.name,
        dues: formatMoney(parseMoney(row.dues)),
        collectionsToday: formatMoney(parseMoney(row.collectionsToday)),
        revenueMonth: formatMoney(parseMoney(row.revenueMonth)),
        stockValue: options.canSeeCost ? formatMoney(parseMoney(row.stockValue)) : null,
      })),
    };
  }
}

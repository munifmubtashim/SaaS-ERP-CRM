import type { OwnerDashboard } from '@erp/shared';

/** What ReportController needs. Owned by api; businessLogic's ReportManager satisfies it. */
export interface IReportManager {
  /** ADR 0023 (amended 24 Nov): the figures from the ledger; stock value null without product.cost.view. */
  ownerDashboard(options: { canSeeCost: boolean }): Promise<OwnerDashboard>;
}

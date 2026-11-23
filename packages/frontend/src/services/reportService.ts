import {
  agedDuesSchema,
  bankFeedSchema,
  branchResultsSchema,
  cashPositionSchema,
  customerInsightsSchema,
  dayCloseStatusSchema,
  monthlyResultsSchema,
  needsActionSchema,
  ownerDashboardSchema,
  salesTargetSchema,
  salesTodaySchema,
  stockValueSchema,
  unitStockSchema,
  vatReturnSchema,
  type AgedDues,
  type BankFeed,
  type BranchResults,
  type CashPosition,
  type CustomerInsights,
  type DayCloseStatus,
  type MonthlyResults,
  type NeedsAction,
  type OwnerDashboard,
  type SalesTarget,
  type SalesToday,
  type StockValue,
  type UnitStock,
  type VatReturn,
} from '@erp/shared';
import type { IHttpClient } from './HttpClient';

/**
 * The owner dashboard's figures, one call per group, so each can be real or sample on its own (VITE_DEMO_DATA key
 * `report.<call>`). Will be real: ownerDashboard (#10: collections and dues), salesToday, stockValue, customerDues.
 * Stay sample: supplierDues, salesTarget, vatReturn, cashPosition, monthlyResults, bankFeed, branchResults,
 * customerInsights, needsAction, dayCloseStatus, unitStock (the last will be real with the stock ledger).
 */
export interface IReportService {
  ownerDashboard(): Promise<OwnerDashboard>;
  salesToday(): Promise<SalesToday>;
  stockValue(): Promise<StockValue>;
  customerDues(): Promise<AgedDues>;
  supplierDues(): Promise<AgedDues>;
  salesTarget(): Promise<SalesTarget>;
  vatReturn(): Promise<VatReturn>;
  cashPosition(): Promise<CashPosition>;
  monthlyResults(): Promise<MonthlyResults>;
  bankFeed(): Promise<BankFeed>;
  branchResults(): Promise<BranchResults>;
  customerInsights(): Promise<CustomerInsights>;
  needsAction(): Promise<NeedsAction>;
  dayCloseStatus(): Promise<DayCloseStatus>;
  unitStock(): Promise<UnitStock>;
}

export type ReportCall = keyof IReportService;

/**
 * Report module: the API. Owner: Munif. Only GET /v1/reports/owner-dashboard is planned (#10, task M6); the other
 * paths are provisional and none exists yet, so a build without sample data shows these cards' error state.
 */
export class ReportService implements IReportService {
  constructor(protected readonly http: IHttpClient) {}
  ownerDashboard = () => this.http.getJson('/v1/reports/owner-dashboard', ownerDashboardSchema);
  salesToday = () => this.http.getJson('/v1/reports/sales-today', salesTodaySchema);
  stockValue = () => this.http.getJson('/v1/reports/stock-value', stockValueSchema);
  customerDues = () => this.http.getJson('/v1/reports/customer-dues', agedDuesSchema);
  supplierDues = () => this.http.getJson('/v1/reports/supplier-dues', agedDuesSchema);
  salesTarget = () => this.http.getJson('/v1/reports/sales-target', salesTargetSchema);
  vatReturn = () => this.http.getJson('/v1/reports/vat-return', vatReturnSchema);
  cashPosition = () => this.http.getJson('/v1/reports/cash-position', cashPositionSchema);
  monthlyResults = () => this.http.getJson('/v1/reports/monthly-results', monthlyResultsSchema);
  bankFeed = () => this.http.getJson('/v1/reports/bank-feed', bankFeedSchema);
  branchResults = () => this.http.getJson('/v1/reports/branch-results', branchResultsSchema);
  customerInsights = () => this.http.getJson('/v1/reports/customer-insights', customerInsightsSchema);
  needsAction = () => this.http.getJson('/v1/reports/needs-action', needsActionSchema);
  dayCloseStatus = () => this.http.getJson('/v1/reports/day-close-status', dayCloseStatusSchema);
  unitStock = () => this.http.getJson('/v1/reports/unit-stock', unitStockSchema);
}

/** Sends each call to the sample or the real service, by its own key. Built only in createServices. */
export class ReportServiceSwitch implements IReportService {
  constructor(
    private readonly real: IReportService,
    private readonly sample: IReportService,
    private readonly useSample: (call: ReportCall) => boolean,
  ) {}
  private pick(call: ReportCall): IReportService {
    return this.useSample(call) ? this.sample : this.real;
  }
  ownerDashboard = () => this.pick('ownerDashboard').ownerDashboard();
  salesToday = () => this.pick('salesToday').salesToday();
  stockValue = () => this.pick('stockValue').stockValue();
  customerDues = () => this.pick('customerDues').customerDues();
  supplierDues = () => this.pick('supplierDues').supplierDues();
  salesTarget = () => this.pick('salesTarget').salesTarget();
  vatReturn = () => this.pick('vatReturn').vatReturn();
  cashPosition = () => this.pick('cashPosition').cashPosition();
  monthlyResults = () => this.pick('monthlyResults').monthlyResults();
  bankFeed = () => this.pick('bankFeed').bankFeed();
  branchResults = () => this.pick('branchResults').branchResults();
  customerInsights = () => this.pick('customerInsights').customerInsights();
  needsAction = () => this.pick('needsAction').needsAction();
  dayCloseStatus = () => this.pick('dayCloseStatus').dayCloseStatus();
  unitStock = () => this.pick('unitStock').unitStock();
}

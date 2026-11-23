import {
  agedDuesSchema,
  bankFeedSchema,
  cashPositionSchema,
  monthlyResultsSchema,
  ownerDashboardSchema,
  salesTargetSchema,
  salesTodaySchema,
  stockValueSchema,
  vatReturnSchema,
  type AgedDues,
  type BankFeed,
  type CashPosition,
  type MonthlyResults,
  type OwnerDashboard,
  type SalesTarget,
  type SalesToday,
  type StockValue,
  type VatReturn,
} from '@erp/shared';
import type { IHttpClient } from './HttpClient';

/**
 * The owner dashboard's figures, one call per group, so each can be real or sample on its own (VITE_DEMO_DATA key
 * `report.<call>`). Will be real: ownerDashboard (#10: collections and dues), salesToday, stockValue, customerDues.
 * Stay sample: supplierDues, salesTarget, vatReturn, cashPosition, monthlyResults, bankFeed.
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
}

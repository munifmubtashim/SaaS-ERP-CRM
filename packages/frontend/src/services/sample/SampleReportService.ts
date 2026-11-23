import type {
  AgedDues,
  BankFeed,
  BranchResults,
  CashPosition,
  CustomerInsights,
  DayCloseStatus,
  KpiTrends,
  MonthlyResults,
  NeedsAction,
  OwnerDashboard,
  SalesTarget,
  SalesToday,
  StockValue,
  UnitStock,
  VatReturn,
} from '@erp/shared';
import type { IReportService, ReportCall } from '../reportService';

/** Every report call, for tests and the demo switch. */
export const REPORT_CALLS: readonly ReportCall[] = [
  'ownerDashboard',
  'salesToday',
  'stockValue',
  'customerDues',
  'supplierDues',
  'salesTarget',
  'vatReturn',
  'cashPosition',
  'monthlyResults',
  'bankFeed',
  'branchResults',
  'customerInsights',
  'needsAction',
  'dayCloseStatus',
  'unitStock',
  'kpiTrends',
];

/*
 * Invented sample figures (no real names, phones, addresses or prices), from the approved design's own invented
 * November story: 12 November 2026, 11 of 30 days. Every screen showing them carries the Demo data badge.
 */
const AS_OF = '2026-11-12T03:00:00.000Z'; // 9:00 AM in Dhaka
const MOTORS = { businessId: '0196f000-0000-7000-8000-00000000d0a1', name: 'Sample Motors' };
const PARTS = { businessId: '0196f000-0000-7000-8000-00000000d0a2', name: 'Sample Spare Parts' };

const PERIOD = { from: '2026-11-01', to: '2026-11-11' };
const branch = (
  branchId: string,
  branchName: string,
  businessName: string,
  revenue: string,
  profit: string,
) => ({
  branchId,
  branchName,
  businessName,
  revenue,
  profit,
});
const action = (
  id: string,
  kind: NeedsAction['items'][number]['kind'],
  severity: 'critical' | 'warning',
  ageDays: number,
  amount: string | null,
  count: number | null,
  businessName: string | null,
  branchName: string | null,
) => ({ id, kind, severity, ageDays, amount, count, businessName, branchName });

const crore = (amounts: string) => amounts.split(' ');
const REVENUE = crore('31200000.00 29900000.00 34100000.00 35700000.00 37200000.00 38300000.00');
const EXPENSES = crore('26100000.00 26000000.00 28500000.00 30100000.00 31900000.00 32000000.00');

const SAMPLE: { [K in ReportCall]: Awaited<ReturnType<IReportService[K]>> } = {
  ownerDashboard: {
    asOf: AS_OF,
    totals: { dues: '6348645.00', collectionsToday: '1150000.00' },
    businesses: [
      { ...MOTORS, dues: '4820400.00', collectionsToday: '910000.00' },
      { ...PARTS, dues: '1528245.00', collectionsToday: '240000.00' },
    ],
  } satisfies OwnerDashboard,
  salesToday: {
    asOf: AS_OF,
    today: '1280000.00',
    invoicesToday: 14,
    monthToDate: '14059500.00',
    byBusiness: [
      { ...MOTORS, monthToDate: '10248000.00' },
      { ...PARTS, monthToDate: '3811500.00' },
    ],
  } satisfies SalesToday,
  stockValue: { asOf: AS_OF, unitsInStock: 46, unitsOver90Days: 4 } satisfies StockValue,
  customerDues: {
    asOf: AS_OF,
    entries: [
      { ageDays: 6, amount: '1412485.00' },
      { ageDays: 22, amount: '1000000.00' },
      { ageDays: 41, amount: '1777621.00' },
      { ageDays: 75, amount: '1358539.00' },
      { ageDays: 120, amount: '800000.00' },
    ],
  } satisfies AgedDues,
  supplierDues: {
    asOf: AS_OF,
    entries: [
      { ageDays: 9, amount: '2198996.00' },
      { ageDays: 44, amount: '1199453.00' },
      { ageDays: 68, amount: '599726.00' },
    ],
  } satisfies AgedDues,
  salesTarget: {
    month: '2026-11',
    daysInMonth: 30,
    daysElapsed: 11,
    target: '40000000.00',
    byBusiness: [
      { ...MOTORS, target: '28000000.00' },
      { ...PARTS, target: '12000000.00' },
    ],
  } satisfies SalesTarget,
  vatReturn: {
    period: '2026-10',
    dueOn: '2026-11-15',
    estimatedPayable: '486200.00',
    status: 'draft',
  } satisfies VatReturn,
  cashPosition: {
    asOf: AS_OF,
    cashNow: '6580095.00',
    averageDailySpending: '1096682.50',
    averageDailySales: '1280000.00',
  } satisfies CashPosition,
  monthlyResults: {
    months: ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'].map((month, i) => ({
      month,
      revenue: REVENUE[i] ?? '0.00',
      expenses: EXPENSES[i] ?? '0.00',
      estimate: month === '2026-11',
    })),
  } satisfies MonthlyResults,
  bankFeed: { lastSyncAt: AS_OF } satisfies BankFeed,
  branchResults: {
    period: PERIOD,
    branches: [
      branch('0196f000-0000-7000-8000-00000000d0b1', 'Mirpur-10', MOTORS.name, '5240000.00', '1100000.00'),
      branch('0196f000-0000-7000-8000-00000000d0b2', 'Uttara', MOTORS.name, '3125000.00', '688000.00'),
      branch('0196f000-0000-7000-8000-00000000d0b3', 'Mirpur-10', PARTS.name, '2215000.00', '531000.00'),
      branch('0196f000-0000-7000-8000-00000000d0b4', 'Narayanganj', MOTORS.name, '1870000.00', '65000.00'),
      branch('0196f000-0000-7000-8000-00000000d0b5', 'Agrabad', PARTS.name, '1610000.00', '-71000.00'),
    ],
  } satisfies BranchResults,
  customerInsights: {
    period: PERIOD,
    customersBought: 214,
    repeatCustomers: 124,
    totalRevenue: '14059500.00',
    topCustomers: [
      { name: 'Sample Traders', revenue: '1240000.00' },
      { name: 'Sample Auto Centre', revenue: '985000.00' },
      { name: 'Sample Enterprise', revenue: '720000.00' },
      { name: 'Sample Customer One', revenue: '495000.00' },
      { name: 'Sample Customer Two', revenue: '360000.00' },
    ],
  } satisfies CustomerInsights,
  needsAction: {
    items: [
      action('a1', 'unit_sold_not_delivered', 'critical', 6, '134000.00', null, MOTORS.name, 'Mirpur-10'),
      action('a2', 'bank_receipt_unmatched', 'critical', 3, '85000.00', null, MOTORS.name, 'Uttara'),
      // The design shows "parts sold at zero stock", which the system can't do (negative stock is blocked).
      action('a3', 'parts_below_reorder', 'warning', 2, null, 4, PARTS.name, 'Agrabad'),
      action('a4', 'supplier_duplicates', 'warning', 1, null, 3, null, null),
    ],
  } satisfies NeedsAction,
  dayCloseStatus: {
    status: 'not_balanced',
    lastClosedOn: '2026-11-10',
    unmatchedBankItems: 2,
  } satisfies DayCloseStatus,
  unitStock: {
    asOf: AS_OF,
    available: 58,
    reserved: 14,
    soldNotDelivered: 7,
    over90Days: 15,
  } satisfies UnitStock,
  kpiTrends: {
    revenue: crore('900000.00 990000.00 930000.00 1110000.00 1080000.00 1260000.00 1410000.00'),
    profit: crore('132000.00 126000.00 156000.00 150000.00 174000.00 168000.00 198000.00'),
    cash: crore('5060000.00 4807000.00 5313000.00 5186500.00 5819000.00 6198500.00 6578000.00'),
    customerDues: crore('5569000.00 5791760.00 5680380.00 6125900.00 6014520.00 6460040.00 6348660.00'),
    supplierPayable: crore('3690720.00 3485680.00 3895760.00 3588200.00 3793240.00 3690720.00 3998280.00'),
  } satisfies KpiTrends,
};

/** The dashboard's sample figures behind IReportService. Development builds only (VITE_DEMO_DATA). */
export class SampleReportService implements IReportService {
  constructor(private readonly delayMs = 300) {}
  private answer<K extends ReportCall>(call: K): Promise<(typeof SAMPLE)[K]> {
    return new Promise((resolve) => setTimeout(() => resolve(structuredClone(SAMPLE[call])), this.delayMs));
  }
  ownerDashboard = () => this.answer('ownerDashboard');
  salesToday = () => this.answer('salesToday');
  stockValue = () => this.answer('stockValue');
  customerDues = () => this.answer('customerDues');
  supplierDues = () => this.answer('supplierDues');
  salesTarget = () => this.answer('salesTarget');
  vatReturn = () => this.answer('vatReturn');
  cashPosition = () => this.answer('cashPosition');
  monthlyResults = () => this.answer('monthlyResults');
  bankFeed = () => this.answer('bankFeed');
  branchResults = () => this.answer('branchResults');
  customerInsights = () => this.answer('customerInsights');
  needsAction = () => this.answer('needsAction');
  dayCloseStatus = () => this.answer('dayCloseStatus');
  unitStock = () => this.answer('unitStock');
  kpiTrends = () => this.answer('kpiTrends');
}

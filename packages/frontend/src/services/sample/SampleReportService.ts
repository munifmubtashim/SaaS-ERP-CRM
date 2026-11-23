import type {
  AgedDues,
  BankFeed,
  CashPosition,
  MonthlyResults,
  OwnerDashboard,
  SalesTarget,
  SalesToday,
  StockValue,
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
];

/*
 * Invented sample figures (no real names, phones, addresses or prices), from the approved design's own invented
 * November story: 12 November 2026, 11 of 30 days. Every screen showing them carries the Demo data badge.
 */
const AS_OF = '2026-11-12T03:00:00.000Z'; // 9:00 AM in Dhaka
const MOTORS = { businessId: '0196f000-0000-7000-8000-00000000d0a1', name: 'Sample Motors' };
const PARTS = { businessId: '0196f000-0000-7000-8000-00000000d0a2', name: 'Sample Spare Parts' };

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
}

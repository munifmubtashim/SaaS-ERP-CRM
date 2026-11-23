import {
  agedDuesSchema,
  bankFeedSchema,
  branchResultsSchema,
  cashPositionSchema,
  customerInsightsSchema,
  dayCloseStatusSchema,
  kpiTrendsSchema,
  monthlyResultsSchema,
  needsActionSchema,
  ownerDashboardSchema,
  salesTargetSchema,
  salesTodaySchema,
  stockValueSchema,
  unitStockSchema,
  vatReturnSchema,
} from '@erp/shared';
import { describe, expect, it, vi } from 'vitest';
import type { DemoService } from './demoData';
import type { IHttpClient } from './HttpClient';
import { createServices } from './index';
import { REPORT_CALLS, SampleReportService } from './sample/SampleReportService';

/** The sample's own day (12 November 2026), so these tests never move with the calendar. */
const STORY_DAY = '2026-11-12';

/** Every report call answers from the API or from sample data on its own key (VITE_DEMO_DATA), one at a time. */
class RecordingHttp implements IHttpClient {
  paths: string[] = [];
  getJson = (path: string) => {
    this.paths.push(path);
    return Promise.reject(new Error('no API in this test'));
  };
  postJson = () => Promise.reject(new Error('unused'));
  post = () => Promise.reject(new Error('unused'));
}

describe('report service: one switch per figure group', () => {
  it('a call listed in demo answers from the sample; an unlisted one asks the API', async () => {
    const http = new RecordingHttp();
    const demo = new Set<DemoService>(['report.vatReturn']);
    const { report } = createServices(http, { demo });
    await expect(report.vatReturn()).resolves.toMatchObject({ status: 'draft' });
    await expect(report.salesToday()).rejects.toThrow('no API');
    expect(http.paths).toEqual(['/v1/reports/sales-today']);
  });

  it('every call has its own key, and the real service asks its own path', async () => {
    const http = new RecordingHttp();
    const { report } = createServices(http, { demo: new Set() });
    for (const call of REPORT_CALLS) await report[call]().catch(() => undefined);
    expect(http.paths).toHaveLength(REPORT_CALLS.length);
    expect(new Set(http.paths).size).toBe(REPORT_CALLS.length);
    expect(http.paths).toContain('/v1/reports/owner-dashboard');
  });
});

describe('SampleReportService: invented figures in the shared shapes', () => {
  it('every answer parses with its shared schema', async () => {
    const sample = new SampleReportService(0, STORY_DAY);
    expect(ownerDashboardSchema.parse(await sample.ownerDashboard())).toBeTruthy();
    expect(salesTodaySchema.parse(await sample.salesToday())).toBeTruthy();
    expect(stockValueSchema.parse(await sample.stockValue())).toBeTruthy();
    expect(agedDuesSchema.parse(await sample.customerDues())).toBeTruthy();
    expect(agedDuesSchema.parse(await sample.supplierDues())).toBeTruthy();
    expect(salesTargetSchema.parse(await sample.salesTarget())).toBeTruthy();
    expect(vatReturnSchema.parse(await sample.vatReturn())).toBeTruthy();
    expect(cashPositionSchema.parse(await sample.cashPosition())).toBeTruthy();
    expect(monthlyResultsSchema.parse(await sample.monthlyResults())).toBeTruthy();
    expect(bankFeedSchema.parse(await sample.bankFeed())).toBeTruthy();
    expect(branchResultsSchema.parse(await sample.branchResults())).toBeTruthy();
    expect(customerInsightsSchema.parse(await sample.customerInsights())).toBeTruthy();
    expect(needsActionSchema.parse(await sample.needsAction())).toBeTruthy();
    expect(dayCloseStatusSchema.parse(await sample.dayCloseStatus())).toBeTruthy();
    expect(unitStockSchema.parse(await sample.unitStock())).toBeTruthy();
    expect(kpiTrendsSchema.parse(await sample.kpiTrends())).toBeTruthy();
  });
});

describe('the second-half calls', () => {
  it('needs action has only kinds the system can produce, and never offers a day close', async () => {
    const sample = new SampleReportService(0, STORY_DAY);
    const { items } = await sample.needsAction();
    expect(items.map((item) => item.kind)).not.toContain('sold_at_zero_stock');
    expect(Object.keys(await sample.dayCloseStatus()).sort()).toEqual([
      'lastClosedOn',
      'status',
      'unmatchedBankItems',
    ]);
  });
});

describe('sample dates follow today (or a fixed day, for tests)', () => {
  it('moves every date with the day it is given', async () => {
    const sample = new SampleReportService(0, '2026-12-03');
    expect((await sample.vatReturn()).dueOn).toBe('2026-12-06'); // due in 3 days, as in the design
    expect((await sample.vatReturn()).period).toBe('2026-11'); // last month's return
    expect((await sample.ownerDashboard()).asOf).toBe('2026-12-03T03:00:00.000Z'); // 9:00 AM in Dhaka
    expect(await sample.salesTarget()).toMatchObject({ month: '2026-12', daysInMonth: 31, daysElapsed: 2 });
    expect((await sample.branchResults()).period).toEqual({ from: '2026-12-01', to: '2026-12-02' });
    expect((await sample.dayCloseStatus()).lastClosedOn).toBe('2026-12-01');
    const months = (await sample.monthlyResults()).months;
    expect(months.map((m) => m.month)).toEqual([
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
      '2026-12',
    ]);
    expect(months.map((m) => m.estimate)).toEqual([false, false, false, false, false, true]);
  });

  it('on the first of a month the period is that day alone', async () => {
    const sample = new SampleReportService(0, '2027-01-01');
    expect((await sample.branchResults()).period).toEqual({ from: '2027-01-01', to: '2027-01-01' });
    expect((await sample.salesTarget()).daysElapsed).toBe(1);
  });

  it('without a fixed day it reads today in Dhaka from the clock', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2027-03-09T20:00:00.000Z')); // 2:00 AM on 10 March in Dhaka
    expect((await new SampleReportService(0).vatReturn()).dueOn).toBe('2027-03-13');
    vi.useRealTimers();
  });
});

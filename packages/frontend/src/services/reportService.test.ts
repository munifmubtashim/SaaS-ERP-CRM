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
import { describe, expect, it } from 'vitest';
import type { DemoService } from './demoData';
import type { IHttpClient } from './HttpClient';
import { createServices } from './index';
import { REPORT_CALLS, SampleReportService } from './sample/SampleReportService';

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
    const sample = new SampleReportService(0);
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
    const sample = new SampleReportService(0);
    const { items } = await sample.needsAction();
    expect(items.map((item) => item.kind)).not.toContain('sold_at_zero_stock');
    expect(Object.keys(await sample.dayCloseStatus()).sort()).toEqual([
      'lastClosedOn',
      'status',
      'unmatchedBankItems',
    ]);
  });
});

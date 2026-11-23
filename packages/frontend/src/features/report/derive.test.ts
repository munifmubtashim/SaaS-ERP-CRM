import { describe, expect, it } from 'vitest';
import {
  agingBuckets,
  branchResults,
  cashForecast,
  chartFrame,
  customerShares,
  margin,
  targetProgress,
} from './derive';

/**
 * Dashboard figures derived on screen (design/owner-dashboard/Main.dc.html), all through the shared money helpers.
 * The examples are the design's own (invented) November figures.
 */
describe('targetProgress', () => {
  const november = { target: '40000000.00', achieved: '14059500.00', daysElapsed: 11, daysInMonth: 30 };

  it('percent of target, pace, the gap to pace and the month-end projection', () => {
    expect(targetProgress(november)).toEqual({
      reached: { part: 1405950000n, whole: 4000000000n },
      pace: { part: 11n, whole: 30n },
      paceAmount: '14666666.67',
      behindBy: '607166.67',
      aheadBy: null,
      projection: '38344090.91',
      projectionShare: { part: 3834409091n, whole: 4000000000n },
    });
  });

  it('ahead of pace gives aheadBy and no behindBy', () => {
    const ahead = targetProgress({ ...november, achieved: '20000000.00' });
    expect(ahead.behindBy).toBeNull();
    expect(ahead.aheadBy).toBe('5333333.33');
  });

  it('on day 0 there is no pace and no projection yet', () => {
    const start = targetProgress({ ...november, achieved: '0.00', daysElapsed: 0 });
    expect(start.paceAmount).toBe('0.00');
    expect(start.projection).toBeNull();
    expect(start.projectionShare).toBeNull();
  });
});

describe('agingBuckets', () => {
  it('0 to 30, 31 to 60 and 61 or more days, with each total and its share of all', () => {
    const buckets = agingBuckets([
      { ageDays: 0, amount: '2412485.00' },
      { ageDays: 30, amount: '0.00' },
      { ageDays: 31, amount: '1777621.00' },
      { ageDays: 60, amount: '0.00' },
      { ageDays: 61, amount: '2158539.00' },
    ]);
    expect(buckets.total).toBe('6348645.00');
    expect(buckets.buckets.map((b) => [b.key, b.amount])).toEqual([
      ['0-30', '2412485.00'],
      ['31-60', '1777621.00'],
      ['61+', '2158539.00'],
    ]);
  });

  it('no dues: three empty buckets and a zero total', () => {
    const empty = agingBuckets([]);
    expect(empty.total).toBe('0.00');
    expect(empty.buckets.every((b) => b.amount === '0.00')).toBe(true);
  });
});

describe('cashForecast', () => {
  it('coming in and going out are dues up to 60 days old; cash in 30 days = now + in - out', () => {
    const forecast = cashForecast(
      { cashNow: '6580095.00', averageDailySpending: '1096682.50', averageDailySales: '1280000.00' },
      [
        { ageDays: 10, amount: '2412485.00' },
        { ageDays: 45, amount: '1777621.00' },
        { ageDays: 90, amount: '2158539.00' },
      ],
      [
        { ageDays: 5, amount: '2198996.00' },
        { ageDays: 50, amount: '1199453.00' },
        { ageDays: 70, amount: '599726.00' },
      ],
    );
    expect(forecast).toEqual({
      comingIn: '4190106.00',
      goingOut: '3398449.00',
      cashIn30Days: '7371752.00',
      coverDays: 6,
    });
  });

  it('no spending: cover days is not shown', () => {
    expect(
      cashForecast({ cashNow: '100.00', averageDailySpending: '0.00', averageDailySales: '0.00' }, [], [])
        .coverDays,
    ).toBeNull();
  });
});

describe('margin', () => {
  it('profit and its share of revenue; a loss is negative', () => {
    expect(margin({ revenue: '38300000.00', expenses: '32000000.00' })).toEqual({
      profit: '6300000.00',
      share: { part: 630000000n, whole: 3830000000n },
    });
    expect(margin({ revenue: '100.00', expenses: '150.00' }).profit).toBe('-50.00');
  });

  it('no revenue: no margin share', () => {
    expect(margin({ revenue: '0.00', expenses: '10.00' }).share).toBeNull();
  });
});

describe('branchResults', () => {
  const branches = [
    {
      branchId: 'b1',
      branchName: 'Branch One',
      businessName: 'Sample Motors',
      revenue: '5240000.00',
      profit: '1100000.00',
    },
    {
      branchId: 'b2',
      branchName: 'Branch Two',
      businessName: 'Sample Motors',
      revenue: '1870000.00',
      profit: '65000.00',
    },
    {
      branchId: 'b3',
      branchName: 'Branch Three',
      businessName: 'Sample Spare Parts',
      revenue: '1610000.00',
      profit: '-71000.00',
    },
  ];

  it('each branch gets its margin; a loss branch has a negative margin', () => {
    const rows = branchResults(branches).branches;
    expect(rows.map((r) => r.margin)).toEqual([
      { part: 110000000n, whole: 524000000n },
      { part: 6500000n, whole: 187000000n },
      { part: -7100000n, whole: 161000000n },
    ]);
  });

  it('totals per business, in first-seen order, with their margins', () => {
    expect(branchResults(branches).businesses).toEqual([
      {
        businessName: 'Sample Motors',
        revenue: '7110000.00',
        profit: '1165000.00',
        margin: { part: 116500000n, whole: 711000000n },
      },
      {
        businessName: 'Sample Spare Parts',
        revenue: '1610000.00',
        profit: '-71000.00',
        margin: { part: -7100000n, whole: 161000000n },
      },
    ]);
  });

  it('a branch with no revenue has no margin', () => {
    expect(
      branchResults([
        {
          branchId: 'b1',
          branchName: 'Branch One',
          businessName: 'Sample Motors',
          revenue: '0.00',
          profit: '0.00',
        },
      ]).branches[0]?.margin,
    ).toBeNull();
  });
});

describe('customerShares', () => {
  it('repeat rate, new buyers and the top customers share of revenue', () => {
    expect(
      customerShares({
        customersBought: 214,
        repeatCustomers: 124,
        totalRevenue: '14059500.00',
        topCustomers: ['1240000.00', '985000.00', '720000.00', '495000.00', '360000.00'].map((revenue) => ({
          name: 'x',
          revenue,
        })),
      }),
    ).toEqual({
      repeat: { part: 124n, whole: 214n },
      newBuyers: 90,
      top: { part: 380000000n, whole: 1405950000n },
    });
  });

  it('nobody bought: no shares', () => {
    expect(
      customerShares({ customersBought: 0, repeatCustomers: 0, totalRevenue: '0.00', topCustomers: [] }),
    ).toEqual({
      repeat: null,
      newBuyers: 0,
      top: null,
    });
  });
});

describe('chartFrame', () => {
  it('from zero to the largest value plus 10% headroom, ticks at quarters, positions as fractions', () => {
    const frame = chartFrame(['31200000.00', '38300000.00']);
    expect(frame.min).toBe('0.00');
    expect(frame.max).toBe('42130000.00');
    expect(frame.ticks).toEqual(['0.00', '10532500.00', '21065000.00', '31597500.00', '42130000.00']);
    expect(frame.position('38300000.00')).toBeCloseTo(0.9091, 4);
    expect(frame.position('0.00')).toBe(0);
  });

  it('a loss month moves the baseline below zero', () => {
    const frame = chartFrame(['-1000000.00', '3000000.00']);
    expect(frame.min).toBe('-1000000.00');
    expect(frame.position('-1000000.00')).toBe(0);
    expect(frame.position('0.00')).toBeCloseTo(0.2326, 4);
  });

  it('nothing to plot: a flat frame where every position is 0', () => {
    const frame = chartFrame(['0.00', '0.00']);
    expect(frame.position('0.00')).toBe(0);
  });
});

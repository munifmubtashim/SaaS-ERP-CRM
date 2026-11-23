import { describe, expect, it } from 'vitest';
import { agingBuckets, cashForecast, margin, targetProgress } from './derive';

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

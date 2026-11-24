import type { CashForecast } from '@erp/shared';
import { describe, expect, it } from 'vitest';
import { forecastWeeks } from './forecast';

/** The cash forecast's derived figures (ADR 0047 section 1 and test 6), in paisa through the money helpers. */
const forecast: CashForecast = {
  asOf: '2026-11-24T03:00:00.000Z',
  weeks: 4,
  opening: { cash: '1840095.00', bank: '4215000.00', mobileMoney: '525000.00' },
  buckets: [
    {
      weekStart: '2026-11-21',
      expectedCollections: '2500000.00',
      supplierBills: '1800000.00',
      recurringExpenses: '0.00',
      salaries: '0.00',
    },
    {
      weekStart: '2026-11-28',
      expectedCollections: '1900000.50',
      supplierBills: '2200000.00',
      recurringExpenses: '395000.00',
      salaries: '980000.00',
    },
    {
      weekStart: '2026-12-05',
      expectedCollections: '0.00',
      supplierBills: '0.00',
      recurringExpenses: '0.00',
      salaries: '0.00',
    },
    {
      weekStart: '2026-12-12',
      expectedCollections: '0.01',
      supplierBills: '0.00',
      recurringExpenses: '0.00',
      salaries: '0.00',
    },
  ],
  uncertain: '2158539.00',
};

const secondWeek = {
  weekStart: '2026-11-28',
  expectedCollections: '1900000.50',
  supplierBills: '2200000.00',
  recurringExpenses: '395000.00',
  salaries: '980000.00',
};

describe('forecastWeeks', () => {
  it('opening is the sum of cash, bank and mobile money (ADR 0047 test 1)', () => {
    expect(forecastWeeks(forecast).opening).toBe('6580095.00');
  });

  it('each week closes at its opening plus expected collections, less bills, recurring expenses and salaries', () => {
    const [first, second] = forecastWeeks(forecast).weeks;
    expect(first).toMatchObject({ opening: '6580095.00', closing: '7280095.00' });
    expect(second).toMatchObject({ opening: '7280095.00', closing: '5605095.50' });
  });

  it('carries every closing into the next opening, to the paisa, with no drift (ADR 0047 test 6)', () => {
    const weeks = forecastWeeks(forecast).weeks;
    for (let i = 1; i < weeks.length; i += 1) expect(weeks[i]?.opening).toBe(weeks[i - 1]?.closing);
    expect(weeks.at(-1)?.closing).toBe('5605095.51');
  });

  it('never adds the Uncertain line (dues already overdue) to any week (ADR 0047 line 31)', () => {
    const result = forecastWeeks(forecast);
    expect(result.uncertain).toBe('2158539.00');
    expect(result.weeks.at(-1)?.closing).toBe('5605095.51');
  });

  it('a closing can go below zero: the week of cash pressure the owner needs to see', () => {
    const tight = {
      ...forecast,
      buckets: [{ ...secondWeek, supplierBills: '9000000.00' }],
      weeks: 4 as const,
    };
    expect(forecastWeeks(tight).weeks[0]?.closing).toBe('-1894904.50');
  });
});

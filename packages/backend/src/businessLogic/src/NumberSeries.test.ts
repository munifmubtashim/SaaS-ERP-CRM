import { AppError } from '@erp/shared';
import { describe, expect, it } from 'vitest';
import type { INumberSeriesQuery, TakenNumber } from './contracts/INumberSeriesQuery.js';
import { NumberSeries } from './NumberSeries.js';

/** ADR 0015 unit tests 8 and 10 (fake Query). The atomic take, RLS and the +1 trigger are dal tests 1–7, 9. */
const BRANCH = '01937000-0000-7000-8000-0000000000e0';

class FakeSeriesQuery implements INumberSeriesQuery {
  calls: { kind: string; branchId: string | null }[] = [];
  constructor(private readonly taken: TakenNumber | null) {}
  async take(kind: string, branchId: string | null): Promise<TakenNumber | null> {
    this.calls.push({ kind, branchId });
    return this.taken;
  }
}

describe('NumberSeries.next (ADR 0015)', () => {
  it('8. pads the value to the width and keeps the prefix', async () => {
    const series = new NumberSeries(new FakeSeriesQuery({ prefix: 'RC-UTT-', value: '123', width: 6 }));
    await expect(series.next('receipt', BRANCH)).resolves.toBe('RC-UTT-000123');
  });

  it('8. a value longer than the width prints in full, never cut (Farhan, #54)', async () => {
    const series = new NumberSeries(new FakeSeriesQuery({ prefix: 'RC-UTT-', value: '1000000', width: 6 }));
    await expect(series.next('receipt', BRANCH)).resolves.toBe('RC-UTT-1000000');
  });

  it('10. a branch id takes the branch series; null takes the business-wide series', async () => {
    const query = new FakeSeriesQuery({ prefix: 'C-', value: '7', width: 6 });
    const series = new NumberSeries(query);
    await expect(series.next('party_code', null)).resolves.toBe('C-000007');
    await series.next('receipt', BRANCH);
    expect(query.calls).toEqual([
      { kind: 'party_code', branchId: null },
      { kind: 'receipt', branchId: BRANCH },
    ]);
  });

  it('6. no series for the kind is 409 number_series.missing', async () => {
    const error = await new NumberSeries(new FakeSeriesQuery(null)).next('receipt', BRANCH).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('CONFLICT');
    expect((error as AppError).fields[0]?.code).toBe('number_series.missing');
  });

  it('refuses a value that is not a positive whole number (a dal bug, never formatted)', async () => {
    for (const value of ['0', '-1', '1.5', '', 'abc']) {
      const series = new NumberSeries(new FakeSeriesQuery({ prefix: 'RC-', value, width: 6 }));
      await expect(series.next('receipt', BRANCH), value).rejects.toThrow(AppError);
    }
  });
});

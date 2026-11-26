import { AppError } from '@erp/shared';
import type { INumberSeriesQuery } from './contracts/INumberSeriesQuery.js';
import type { INumberSeries, NumberSeriesKind } from './contracts/provided/INumberSeries.js';

const POSITIVE_WHOLE = /^[1-9]\d*$/;

/**
 * Formats document numbers (ADR 0015). The database never formats: SQL lpad would cut a value longer than the
 * width and print a number already used. padStart pads but never cuts, so 1,000,000 at width 6 is printed in full.
 */
export class NumberSeries implements INumberSeries {
  constructor(private readonly query: INumberSeriesQuery) {}

  async next(kind: NumberSeriesKind, branchId: string | null): Promise<string> {
    const taken = await this.query.take(kind, branchId);
    if (!taken) {
      const message = `No ${kind} number series is set up here.`;
      throw new AppError('CONFLICT', message, [{ path: 'kind', code: 'number_series.missing', message }]);
    }
    if (!POSITIVE_WHOLE.test(taken.value)) {
      throw new AppError('INTERNAL_ERROR', `Number series ${kind} returned an invalid value.`);
    }
    return `${taken.prefix}${taken.value.padStart(taken.width, '0')}`;
  }
}

import type { INumberSeries } from '../contracts/provided/INumberSeries.js';

/** In-memory INumberSeries for consumers' unit tests (ADR 0012 section 5): consecutive numbers per kind and branch. */
export class FakeNumberSeries implements INumberSeries {
  readonly taken: { kind: string; branchId: string | null; number: string }[] = [];
  private readonly counters = new Map<string, number>();

  constructor(private readonly prefix = 'N-') {}

  async next(kind: string, branchId: string | null): Promise<string> {
    const key = `${kind}|${branchId ?? ''}`;
    const value = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, value);
    const number = `${this.prefix}${String(value).padStart(6, '0')}`;
    this.taken.push({ kind, branchId, number });
    return number;
  }
}

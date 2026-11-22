/**
 * The series kinds ADR 0015 names. A module that needs another kind adds it here with the PR that creates its
 * series, so a typo such as `next('reciept', …)` fails typecheck instead of answering number_series.missing.
 */
export const NUMBER_SERIES_KINDS = ['invoice', 'receipt', 'journal', 'party_code'] as const;
export type NumberSeriesKind = (typeof NUMBER_SERIES_KINDS)[number];

/**
 * Published by Accounting (ADR 0012 section 4, ADR 0015 section 5): gapless document numbers. Runs in the caller's
 * transaction; the series row stays locked until it commits, so a rollback leaves no gap.
 * **Numbering order:** document numbers first (invoice, then receipt), journal numbers last. `PostingService`
 * always takes the `journal` number after the caller's own numbers, so every document takes them in that one
 * order (#60).
 */
export interface INumberSeries {
  /** The next formatted number; `branchId` null takes the business-wide series (e.g. `party_code`). */
  next(kind: NumberSeriesKind, branchId: string | null): Promise<string>;
}

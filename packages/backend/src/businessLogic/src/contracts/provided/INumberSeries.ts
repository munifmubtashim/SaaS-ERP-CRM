/**
 * Published by Accounting (ADR 0012 section 4, ADR 0015 section 5): gapless document numbers. Runs in the caller's
 * transaction; the series row stays locked until it commits, so a rollback leaves no gap. A document needing two
 * numbers takes them in `kind` order, so two documents can't deadlock.
 */
export interface INumberSeries {
  /** The next formatted number; `branchId` null takes the business-wide series (e.g. `party_code`). */
  next(kind: string, branchId: string | null): Promise<string>;
}

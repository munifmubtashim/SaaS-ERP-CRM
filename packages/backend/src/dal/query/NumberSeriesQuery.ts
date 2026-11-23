import { BaseQuery } from './BaseQuery.js';

/** A number taken from a series: the raw value as a decimal string (bigint as text), never formatted in SQL. */
export interface TakenNumberRow {
  prefix: string;
  value: string;
  width: number;
}

/**
 * Accounting module: gapless document numbers (ADR 0015 sections 2 and 5). Satisfies businessLogic's
 * contracts/INumberSeriesQuery. Runs inside the request's tenant transaction (BaseQuery), so the series row stays
 * locked until the request commits, and a rollback gives the number back.
 *
 * One atomic UPDATE ... RETURNING, never read-then-write (invariant 6). The branch and business-wide statements are
 * separate so each uses the unique index; `IS NOT DISTINCT FROM` would not. The business is the request's one
 * business: a number is always taken for one business, so a scope with several (a read-only group route) is refused.
 */
export class NumberSeriesQuery extends BaseQuery {
  async take(kind: string, branchId: string | null): Promise<TakenNumberRow | null> {
    await this.requireOneBusiness('A number');
    const rows = branchId
      ? await this.db.$queryRaw<TakenNumberRow[]>`
          UPDATE number_series SET next_value = next_value + 1
          WHERE business_id = (SELECT app_business_ids())[1] AND branch_id = ${branchId}::uuid AND kind = ${kind}
          RETURNING prefix, (next_value - 1)::text AS value, width`
      : await this.db.$queryRaw<TakenNumberRow[]>`
          UPDATE number_series SET next_value = next_value + 1
          WHERE business_id = (SELECT app_business_ids())[1] AND branch_id IS NULL AND kind = ${kind}
          RETURNING prefix, (next_value - 1)::text AS value, width`;
    return rows[0] ?? null;
  }
}

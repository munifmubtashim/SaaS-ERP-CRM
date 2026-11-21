/** A number taken from a series: the raw value as a decimal string (bigint), never formatted in SQL. */
export interface TakenNumber {
  prefix: string;
  value: string;
  /** The minimum number of digits. */
  width: number;
}

/** What NumberSeries needs from dal (ADR 0015 section 5). dal's NumberSeriesQuery will satisfy it. */
export interface INumberSeriesQuery {
  /** One atomic UPDATE ... RETURNING (ADR 0015 section 2); null when no series exists for the kind. */
  take(kind: string, branchId: string | null): Promise<TakenNumber | null>;
}

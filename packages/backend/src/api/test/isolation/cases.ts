/**
 * One entry per tenant-scoped route, keyed "METHOD /full/path". Each case describes how a user of
 * business X attacks business Y on that route. The runner that executes them against a real
 * database arrives with the tenancy module (Phase 1). Empty in Phase 0: no tenant route exists yet.
 */
export interface IsolationCase {
  /** What the attacker tries, in plain words, e.g. "read invoice of business Y by id". */
  attempts: string[];
}

export const ISOLATION_CASES: Record<string, IsolationCase> = {};

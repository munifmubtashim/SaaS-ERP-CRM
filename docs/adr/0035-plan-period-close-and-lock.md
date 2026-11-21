# 0035: Plan for the month lock and the integrity check (D11)

| Field               | Value                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------- |
| Status              | Proposed                                                                                    |
| Date                | 2026-11-21                                                                                  |
| Deciders            | Munif, Farhan                                                                               |
| Owner               | Munif (Accounting; plan row D11)                                                            |
| Spec / roadmap refs | spec A-12, A-24, C-13; CLAUDE.md invariants 1, 3, 9; ADR 0013 (#39), 0017 (#44), 0021 (#59) |

## Context

**Invariant 9:** no back-dated change into a closed or locked period (A-12).

- ADR 0017 (#44) locks a **branch's day**.
- This plan locks a **business's month**, and adds the integrity check (C-13) that compares the caches with the
  ledgers.

The month-end checklist (A-24) is cut from release 1 (plan 9). This is a ledger and migration change, so
CLAUDE.md requires an agreed plan. No code is in this PR.

## Decision

### Table `period_lock` (Accounting, migration `period_lock`)

| Column                   | Notes                                                 |
| ------------------------ | ----------------------------------------------------- |
| `period_month`           | date, the first day of the month; unique per business |
| `locked_at`, `locked_by` | when and who                                          |

The table rules on #27 and #31 apply. It's business-level RLS and append-only: owner `FOR SELECT, INSERT` only,
and a trigger refuses `UPDATE` and `DELETE`.

### The lock

- **Locking:** `POST /v1/periods/:month/lock`, Owner or Accountant, idempotent (ADR 0011). It's allowed only when
  every branch has closed every day of that month (ADR 0017), and it's refused otherwise (`409`,
  `period.days_open`).
- **Enforcement in the database:**
  - ADR 0013's journal-insert trigger (already extended by ADR 0017 for the day lock) also checks `period_lock` for
    the journal's month, with `FOR SHARE`, and raises `period.locked`.
  - The same trigger goes on `stock_movement` (ADR 0021), so stock can't change in a locked month either.
- **Concurrency:** locking takes `FOR UPDATE` on the business's lock row for that month, after checking the day
  closes, the same pattern as ADR 0017. A posting racing the lock either commits first or is refused.
- **No reopening in release 1.** A correction is posted in an open month, with a memo pointing at the original.

### The integrity check (C-13)

- **`npm run integrity:check`:** a script in `tools/`, read-only, run by a person or a scheduled job (no worker
  yet). It runs as the migration owner, through the owner policies, setting the `app.*` values for each business
  in turn.
- **It checks:**
  1. every journal balances;
  2. `stock_balance` equals the sum of movements per product and location;
  3. every invoice and payment has its journal;
  4. receivable balances equal open dues.
- **It prints a report and exits non-zero** on any difference. It never fixes anything.

## Invariants touched

1 (the ledger is the truth, checked), 3 (stock equals its movements), 9 (period lock).

## Tests to write first

1. Posting a journal, or a stock movement, dated in a locked month is refused with `period.locked`, through the
   service and by a direct insert as `erp_app`.
2. Locking is refused while any day of that month is still open in any branch.
3. **Race:** a posting and the lock at once, in both orders. Either the posting commits before the lock, or it's
   refused.
4. Locking twice with the same key gives one lock. A lock row can't be updated or deleted (the RLS path and the
   trigger path, as ADR 0013 test 5).
5. The integrity check passes on a clean seeded database, and fails on each kind of planted difference (made as a
   superuser in a throwaway database).
6. Isolation: business Y can't lock or see X's periods.

## Dependencies

- ADR 0013 (#39), ADR 0017 (#44), ADR 0021 (#59), ADR 0022 (#60).
- ADR 0011 (#37), for the idempotent route.

## Size and PR split

| Part | Contents                                                         | Size |
| ---- | ---------------------------------------------------------------- | ---- |
| 1    | `period_lock`, the trigger extension, the route, tests 1 to 4, 6 | ~350 |
| 2    | the integrity check script, test 5                               | ~250 |

## Consequences

- **Easier:** a locked month's figures never change, so reports for it are final.
- **Harder:** a late correction lands in the next open month, by design.
- **Undo:** before go-live, drop the table and restore the trigger in a new migration.

## Open questions (with recommended answers)

1. **Munif:** reopen a locked month in release 1? Recommended: never.
2. **Munif:** require every day closed before the month lock? Recommended: yes.
3. **Munif:** who runs the integrity check, and how often? Recommended: nightly, a scheduled job on the server set
   up by a person (no worker yet).

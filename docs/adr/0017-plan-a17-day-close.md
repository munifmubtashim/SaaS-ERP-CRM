# 0017: Plan for A17, daily closing and the day lock

| Field               | Value                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------- |
| Status              | Proposed                                                                                      |
| Date                | 2026-11-21                                                                                    |
| Deciders            | Munif, Farhan                                                                                 |
| Owner               | **Farhan** builds the screen (queue task F6); **Munif** builds the tables and lock (plan A17) |
| Spec / roadmap refs | CLAUDE.md invariants 1, 2, 6, 9; spec A-19, S-19, A-12, RP-03; ADR 0012, 0013; plan Q14, A17  |

## Context

At the end of the day a branch counts its cash and compares it with what the books expect (A-19). A
difference needs a reason. Once closed, nothing can be posted into that day (invariant 9: no back-dated
change into a closed period).

**Moto Mart answer Q14:** shift close per cashier (S-19), day close per branch (A-19); the day closes after all
shifts. This plan builds the **branch day close and its lock**. Shift close is open question 1.

**The hard part is the race.** A payment may be posting while the manager closes the day. Without a lock, the
payment can commit into the day just closed, after its expected cash was read. CLAUDE.md requires an agreed
plan for ledger and concurrency code. No code is in this PR.

## Decision

### 1. Tables (migration `day_close`, `accounting.prisma`)

**`business_day`**, one row per branch and business date, the thing that is locked:

| Column          | Notes                                            |
| --------------- | ------------------------------------------------ |
| `business_id`   | RLS                                              |
| `branch_id`     | composite foreign key `(branch_id, business_id)` |
| `business_date` | date, Asia/Dhaka                                 |
| `status`        | `open` or `closed`                               |
| `closed_at`     | nullable                                         |
| `closed_by`     | nullable                                         |

Unique on `(business_id, branch_id, business_date)`.

**`day_close`**, the count and its result:

| Column                | Notes                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------- |
| `business_day`        | `branch_id` and `business_date`, unique, so a day closes once                            |
| `opening_cash`        | `numeric(18,2)`, the previous close's `counted_cash`, or the first close's entered float |
| `expected_cash`       | opening plus the day's lines on cash-role accounts for the branch                        |
| `counted_cash`        | typed in                                                                                 |
| `variance`            | generated: `counted_cash - expected_cash`                                                |
| `variance_reason`     | text; a `CHECK` requires it when the variance isn't zero                                 |
| `variance_journal_id` | the journal that books the variance, null when it is zero                                |
| `method_totals`       | jsonb snapshot of the day's totals per payment method, for the closing report (RP-03)    |
| `closed_by`           |                                                                                          |
| `created_at`          |                                                                                          |

Both are append-only for `erp_app`, apart from `business_day.status` going `open` → `closed` (a trigger
refuses any other change).

### 2. The lock, inside journal posting

ADR 0013's journal table gets one more `BEFORE INSERT` trigger:

1. `INSERT INTO business_day (...) VALUES (NEW.business_id, NEW.branch_id, NEW.journal_date, 'open') ON
CONFLICT DO NOTHING`. The row exists from the first posting of the day.
2. `SELECT status FROM business_day WHERE ... FOR SHARE`.
3. If `closed`: raise. `PostingService` turns it into `409 CONFLICT`, field code `period.locked` (ADR 0012).

Many postings can hold `FOR SHARE` at once, so payments don't block each other.

### 3. Closing, in one transaction (`AccountingManager.closeDay`)

1. `SELECT ... FROM business_day WHERE ... FOR UPDATE`. This **waits** for every in-flight posting in that
   branch and day to commit, and blocks new ones until the close ends.
2. Refuse if already `closed` (`409`, `day_close.already_closed`), or if the date is after today in Dhaka.
3. Compute `expected_cash` from the journal lines, which are now stable: no posting can enter the day while
   the row is locked.
4. If the variance isn't zero, post the variance journal through `IPostingService`:
   - **counted over expected:** Dr `cash`, Cr `cash_over_short`;
   - **counted under expected:** the reverse.

   It posts into the same day, which is allowed because the row is still `open` and this transaction holds
   its lock.

5. Insert `day_close`; set `business_day.status = 'closed'`. Commit.

A payment that was waiting on step 1 resumes after commit. Its `FOR SHARE` re-reads the row (READ COMMITTED),
sees `closed`, and fails with `period.locked`. The cashier posts it again into today. One wins, cleanly: the
same pattern as invariant 6.

### 4. Not in release 1

- **Reopening a closed day.** A correction after close is posted into an open day with a memo pointing at the
  original. Reopen with approval comes later (open question 2).
- **Month and year lock** (A-12, A-24). It will reuse the same trigger with a `period_lock` table; planned
  with month-end close.

### 5. Code and route

- **dal:** `DayCloseQuery`:
  - `lockDay` (the `FOR UPDATE`);
  - `cashLinesTotal`;
  - `previousCounted`;
  - `insertClose`;
  - `markClosed`;
  - `methodTotals`.
- **businessLogic:** `AccountingManager.closeDay`, using the shared money helpers for every sum.
- **api:** `POST /v1/branches/:branchId/days/:date/close`, `{ idempotent: true }`, `X-Branch-Id` required
  (ADR 0007). Allowed for the Owner, Branch Manager and Accountant roles. One isolation case.
- **frontend (Farhan, F6):** the close screen. It shows expected per method, takes the counted cash, and
  requires a reason when the counts differ.

## Tests to write first (real Postgres; run to see them fail)

1. Posting into a closed day fails with `period.locked`, through `PostingService` **and** through a direct
   `INSERT` as `erp_app`.
2. Posting into the next day after a close succeeds.
3. **The race:** a payment's transaction posts and stays open; `closeDay` starts and waits; the payment commits;
   the close then includes it in `expected_cash`. Reversed order: the close holds the lock; the payment waits,
   then fails with `period.locked`, and nothing of it remains.
4. A non-zero variance without a reason is refused (the `CHECK`, and the Manager before it).
5. Over and under: the variance journal balances, uses `cash_over_short`, and is in the closed day.
6. Closing twice is refused; closing a future date is refused.
7. `expected_cash` equals opening plus the sum of that branch's cash lines for the date, and ignores other
   branches and other dates.
8. `erp_app` can't reopen a day (`closed` → `open`) or edit a close.
9. Isolation: branch or business Y can't close or read X's day.
10. Unit (fake Query): reason rules and variance direction; money sums only through shared helpers.

## Migration steps (written here, applied in the PR, not now)

1. Merge `main`; tell Farhan `day_close` is in flight. Plan section 6, row 8: after `accounting_core`, either
   order with `sales_payment`.
2. Add both models to `accounting.prisma`. The journal trigger change is SQL only: a new function in
   `dal/sql/triggers/journal.sql`, and `CREATE OR REPLACE` in this migration, never an edit of the
   `accounting_core` migration.
3. `npm run db:migrate:new -- day_close`; append RLS, grants and both triggers; review the SQL.
4. `npm run db:migrate:check`; `db:migrate:deploy` locally; `test:integration`; `test:isolation`.

## Size and PR split

| Part | Owner | Branch                  | Contents                                                   | Size (approx.) | Needs first                     |
| ---- | ----- | ----------------------- | ---------------------------------------------------------- | -------------- | ------------------------------- |
| 1    | M     | `feat/day-lock`         | migration, both triggers, `DayCloseQuery`, tests 1–3, 8, 9 | ~400           | A13 part 1                      |
| 2    | M     | `feat/day-close`        | `closeDay`, variance posting, route, tests 4–7, 10         | ~350           | part 1, A13 part 2, A14         |
| 3    | F     | `feat/day-close-screen` | the screen on the route (or a mock first)                  | ~350           | part 2 (or its schema, to mock) |

## Blocked by

- **A13** (ADR 0013, #39) parts 1 and 2: journals, `PostingService`, `cash_over_short` role.
- **A14** (ADR 0014, #40): the close route is idempotent.
- **The business-date helper** ("today in Asia/Dhaka", plan B15).
- **Payments** (A15, A16) aren't needed to build it, but are needed to demo it.

## Consequences

- **Easier:** the closing report (RP-03) reads a fixed snapshot; nothing can change a closed day's figures.
- **Harder:** every posting takes a shared row lock on its day. That's cheap, but a close briefly pauses
  postings in that branch.
- **Keep true:** the lock is in the database, not only in the Manager; closing reads expected cash only while
  holding the lock.
- **Undo:** before go-live, drop the trigger and tables in a new migration.

## Open questions

1. **Farhan:** shift close per cashier (Q14) in release 1, or day close only first? Shift close would add a
   `shift` table and per-cashier counts, closed before the day.
2. **Both:** reopening a closed day: never in release 1 (recommended), or Owner-only with an approval?
3. **Munif:** the opening float on a branch's first close. Typed in once (recommended), or a separate
   "opening cash" journal from the import (F-09)?
4. **Accountant:** one `cash_over_short` account (income or expense by sign), or two separate accounts?

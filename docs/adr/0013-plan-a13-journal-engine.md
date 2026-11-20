# 0013: Plan for A13, the journal engine (accounts, journals, lines, triggers)

| Field               | Value                                                                                              |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| Status              | Proposed                                                                                           |
| Date                | 2026-11-21                                                                                         |
| Deciders            | Munif, Farhan                                                                                      |
| Owner               | Munif (plan row A13, queue task M4)                                                                |
| Spec / roadmap refs | CLAUDE.md invariants 1, 2, 4, 8; spec A-01 to A-05, A-16, A-18; ADR 0005, 0008, 0012; plan A13, §6 |

## Context

**The ledger is the truth** (invariant 1). Every money movement is a balanced journal, posted once, in one
transaction. Posted journals are never updated or deleted; a correction is a reversal (invariant 2).

**Why now.** Farhan's payments (A15) and their posting (A16, ADR 0016) need it. So do day close (A17, ADR 0017)
and the real dashboard (A18).

**What this plan builds:**

- the accounting tables;
- the database triggers that enforce balance and immutability;
- `AccountingQuery`;
- `PostingService`, implementing `IPostingService` from ADR 0012.

CLAUDE.md requires an agreed plan before ledger or migration code. No code is in this PR.

## Decision

### 1. Tables (migration `accounting_core`, `dal/prisma/schema/accounting.prisma`)

Every table has `business_id`, RLS enabled and forced, `created_at` and `created_by`. Ids default to
`uuid_v7()` (#29). Money is `numeric(18,2)`.

**`account`**, the chart of accounts per business (A-16):

| Column        | Notes                                                    |
| ------------- | -------------------------------------------------------- |
| `code`        | text, unique per business                                |
| `name`        | text                                                     |
| `name_bn`     | text, nullable                                           |
| `type`        | `asset`, `liability`, `equity`, `income` or `expense`    |
| `parent_id`   | nullable, same business (composite foreign key)          |
| `is_postable` | only leaf accounts take lines                            |
| `status`      | `active` or `archived`. Never deleted once it has a line |
| `version`     | edited concurrently (name, status)                       |

**`account_role`**, the mapping from ADR 0012's roles to accounts: `(business_id, role, account_id)`, unique
on `(business_id, role)`. A role mapped to a liability-type account is enforced for pass-through roles (a
trigger checks `pass_through_payable` and `customer_advance` map to `liability`; invariant 8).

**`journal`:**

| Column         | Notes                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------- |
| `branch_id`    | composite foreign key to `branch (id, business_id)`                                             |
| `number`       | from the number series (ADR 0015); unique per business                                          |
| `journal_date` | date, the business date in Asia/Dhaka                                                           |
| `source_type`  | text, e.g. `sales_payment`, `manual`, `reversal`                                                |
| `source_id`    | uuid                                                                                            |
| `memo`         | text                                                                                            |
| `reversal_of`  | nullable, composite foreign key to `journal (id, business_id)`; unique, so one reversal at most |
| `posted_at`    | timestamptz                                                                                     |

Unique on `(business_id, source_type, source_id)` for non-reversals, so a document posts once.

**`journal_line`:**

| Column       | Notes                                                   |
| ------------ | ------------------------------------------------------- |
| `journal_id` | composite foreign key `(journal_id, business_id)`       |
| `line_no`    | int, unique per journal                                 |
| `account_id` | composite foreign key `(account_id, business_id)`       |
| `debit`      | `numeric(18,2)`, ≥ 0                                    |
| `credit`     | `numeric(18,2)`, ≥ 0                                    |
| `party_id`   | nullable uuid, for customer and supplier ledgers (A-06) |

A `CHECK` requires exactly one side above zero.

Composite foreign keys with `business_id` stop a line, account or parent from another business being
referenced even by a buggy query, on top of RLS.

### 2. Triggers (`dal/sql/triggers/journal.sql`, copied into the migration)

1. **Balanced at commit:** a `DEFERRABLE INITIALLY DEFERRED` constraint trigger on `journal_line` insert and
   on `journal` insert. At commit it checks, per journal:
   - the sum of debits equals the sum of credits;
   - there are at least two lines.

   A journal with no lines fails too. Deferred, so the lines can be inserted one statement after the journal.

2. **Immutable:** `BEFORE UPDATE OR DELETE` on `journal` and `journal_line` raises, for every role. Owners
   included, so a migration can't quietly edit history either. `TRUNCATE` is revoked from `erp_app`, and a
   `BEFORE TRUNCATE` trigger raises.
3. **Postable account only:** a line on a non-postable or archived account raises.
4. **Reversal mirrors:** a journal with `reversal_of` must have lines that are the original's with debit and
   credit swapped. Checked by the deferred trigger.
5. **Period lock hook:** none here. ADR 0017 adds the day-close check to journal insert.

### 3. Grants for `erp_app`

| Table                     | Allowed                                                       |
| ------------------------- | ------------------------------------------------------------- |
| `account`                 | `SELECT`, `INSERT`, `UPDATE (name, name_bn, status, version)` |
| `account_role`            | `SELECT`, `INSERT`, `UPDATE (account_id)`                     |
| `journal`, `journal_line` | `SELECT`, `INSERT` only                                       |

No `DELETE` anywhere.

### 4. Code

- **dal:**
  - `AccountingQuery.insertJournal(draft)`: one `INSERT` for the journal, one multi-row `INSERT` for the
    lines.
  - `findRoleAccounts(roles)`.
  - `findJournal(id)` for reversal.
  - DTOs read `numeric` as strings with two decimals, never `Decimal.toString()` (plan A10a).
- **businessLogic:** `PostingService implements IPostingService` (ADR 0012).
  - Validates the draft with `sumMoney` and the other money helpers.
  - Maps roles to accounts.
  - Takes the number from `INumberSeries` (ADR 0015).
  - Calls the Query.
- **No route in A13.** Payments post through Sales (ADR 0016). Manual journals (A-17) need approvals and come
  later.

### 5. Default chart and role mapping

A business needs accounts before it can post. **Recommended:** `POST /v1/accounts/setup` creates a default chart and role mapping for the active business.

- Owner only, idempotent (ADR 0011).
- Accounts: cash, bank, mobile money, card clearing, receivables, customer advances, pass-through payable,
  sales revenue, service revenue, cost of goods, cash over and short.

The provisioning path (ADR 0010) stays limited to `business` and `branch`. Open question 2.

## Tests to write first (real Postgres; run to see them fail)

1. A balanced journal commits; its lines read back with exact two-decimal strings.
2. An unbalanced journal fails **at `COMMIT`**, not at insert; nothing remains.
3. A journal with no lines, or with one line, fails at commit.
4. A line with both debit and credit, or a negative amount, is refused.
5. `UPDATE` and `DELETE` on a posted journal or line fail, as `erp_app` **and** as the owner role.
   `TRUNCATE` fails.
6. A reversal posts mirror lines and points at the original; a second reversal of the same journal is
   refused; a reversal that doesn't mirror is refused.
7. The same source posted twice: the second is refused. Two parallel posts of the same source: exactly one
   commits.
8. A line pointing at another business's journal or account is refused (composite keys), even with RLS off in
   the test.
9. RLS: business X can't read Y's accounts, journals or lines; a guessed id returns nothing.
10. `pass_through_payable` can't be mapped to an income account.
11. Unit (businessLogic, fake Query): `PostingService` refuses unbalanced, single-line and unmapped drafts
    before any Query call; the contract suite from ADR 0012 passes.

## Migration steps (written here, applied in the PR, not now)

1. Merge `main`; tell Farhan `accounting_core` is in flight (plan section 6: before `idempotency_key`).
2. Add `accounting.prisma` models. Raw-SQL-only parts (triggers, composite foreign keys Prisma can't express,
   RLS, grants) go in `dal/sql/triggers/journal.sql` and `dal/sql/rls/accounting.sql`.
3. `npm run db:migrate:new -- accounting_core`; append the SQL files' contents to the generated migration;
   review the SQL.
4. `npm run db:migrate:check` passes. Any foreign key that exists only in raw SQL is declared in Prisma too, or
   it shows as drift (found on #28/#29).
5. `npm run db:migrate:deploy` locally; `npm run test:integration`; `npm run test:isolation`.

## Size and PR split

| Part | Branch                 | Contents                                                           | Size (approx.) | Needs first                  |
| ---- | ---------------------- | ------------------------------------------------------------------ | -------------- | ---------------------------- |
| 1    | `feat/journal-engine`  | migration, triggers, RLS, grants, integration tests 1–10           | ~450           | A3b part 1 (ADR 0009), #29   |
| 2    | `feat/posting-service` | `AccountingQuery`, DTOs, `PostingService`, unit and contract tests | ~350           | part 1, ADR 0012, ADR 0015   |
| 3    | `feat/accounts-setup`  | default chart and roles, the setup route, isolation case           | ~250           | part 2, ADR 0011 build (A14) |

Part 1 is over ~400 lines because tables, triggers and RLS ship in one migration (a table without RLS is never
allowed on `main`).

## Blocked by

- **A3b part 1** (`business`, `branch`), ADR 0009 (#31).
- **`uuid_v7()`** (#29).
- **ADR 0012** (#38) agreed, for the role list.
- **ADR 0015** (number series), for journal numbers: part 2 needs it. Whether part 1 waits too depends on
  open question 3.

## Consequences

- **Easier:** every later money feature posts through one tested path; balance and immutability hold even
  against a buggy query.
- **Harder:** fixing a wrong posting always means a reversal and a new journal; no "quick fix" exists, by
  design. Trigger SQL needs the slow line-by-line review.
- **Keep true:** no `UPDATE` or `DELETE` on journals, ever; roles, not codes, in consumers.
- **Undo:** before any real data, a new migration drops the tables. After go-live there is no undo, only new
  migrations.

## Open questions

1. **Farhan:** `party_id` on lines. A composite foreign key to `party` needs the `party` migration (A11)
   merged first. Plan section 6 lets `accounting_core` go first. Recommended: plain uuid column now, foreign
   key added by a small migration after A11.
2. **Munif (owner):** the default chart by an Owner setup action, or seeded by the provisioning path (which
   would widen `erp_provisioner`'s rights, against ADR 0008's amendment)?
3. **Both:** journal `number` required from the start (A13 waits for A14a), or nullable until A14a lands and
   then made required by a later migration? Recommended: required, and build A14a first. It's small.
4. **Accountant (Q16 track):** confirm the default chart's account list and names in Bangla.

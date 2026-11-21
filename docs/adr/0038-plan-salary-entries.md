# 0038: Plan for salary entries (D9)

| Field               | Value                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| Status              | Proposed                                                                                         |
| Date                | 2026-11-21                                                                                       |
| Deciders            | Munif, Farhan                                                                                    |
| Owner               | Munif (Accounting owns the write; Report owns the form; plan row D9)                             |
| Spec / roadmap refs | spec A-08, RP-04, U-10; CLAUDE.md invariants 1, 4, 5, 9; ADR 0013, 0033, 0035; plan 1.5 (1), 3.4 |

## Context

- **Moto Mart (plan 1.5, answer 1):** salaries aren't fixed. Any number of entries per staff member per month, any
  amount, any date.
- **Plan 3.4:** the form sits on the Reports page; Accounting owns the write.
- **Salary is a hidden field** (`accounting.salary.view`, ADR 0033).

This is a ledger, permissions and migration change, so CLAUDE.md requires an agreed plan. No code is in this PR.

## Decision

### Table `salary_entry` (Accounting, migration `salary_entries`)

| Column        | Notes                                                                               |
| ------------- | ----------------------------------------------------------------------------------- |
| `branch_id`   | branch-scoped                                                                       |
| `staff_id`    | composite foreign key to `staff (business_id, id)` (A4 part 4)                      |
| `entry_date`  | business date; the month is the month of this date. **No unique on (staff, month)** |
| `amount`      | `numeric(18,2)`, above zero. **Hidden** (`sensitive: 'salary'`, ADR 0033)           |
| `method`      | `cash` or `bank` (no `accrued` in release 1, decided by Munif, 21 Nov)              |
| `journal_id`  | `NOT NULL`                                                                          |
| `reversal_of` | nullable: a correction is a reversal plus a new entry, never an edit                |

The rules on #27 and #31 apply. It's append-only: owner `FOR SELECT, INSERT`; `erp_app` `SELECT, INSERT`.

### Posting, in one transaction

- **The entry:** Dr `salaries_expense`; Cr `cash` or `bank`. The entry is stored with its `journal_id`
  (invariant 4). Accruals (Cr `salaries_payable`) are a later change.
- **Route:** `POST /v1/accounting/salary-entries`, idempotent (ADR 0011). It needs `accounting.salary.create`.
- **Dates:** an `entry_date` in a closed day or locked month is refused (ADR 0017, 0035).
- **Reading:** the list and any report show amounts only with `accounting.salary.view`. Without it the field is
  absent (ADR 0033), and profit reports still show net profit without the salary line (RP-04).
- **The form** is on the Reports page (Report module, UI only); it calls Accounting's route through
  `accountingService`.

## Invariants touched

1 and 4 (a balanced journal in the same transaction), 2 (corrections by reversal), 5 (idempotent), 9 (period
lock), and permissions (hidden salary).

## Tests to write first

1. Three entries for one staff member in one month are all accepted; each posts a balanced journal.
2. A cash entry credits `cash`, a bank entry `bank`; `accrued` is refused in release 1.
3. A correction is a reversal that points at the original, plus a new entry; an entry can't be updated or deleted
   (the RLS path and the trigger path).
4. Without `accounting.salary.view`, `amount` is absent from the list, the export and the activity record;
   profit reports still show net profit.
5. A dated entry in a locked month is refused; the same `Idempotency-Key` twice gives one entry.
6. A staff member of another business is refused (composite key); isolation for every route.

## Dependencies

- A4 part 4 (`staff`, ADR 0009, #31), ADR 0013 (#39), ADR 0033 (#72), ADR 0035 (#74), ADR 0011 (#37),
  ADR 0037 (#76), later, for clearing accruals.

## Size and PR split

| Part | Contents                                      | Size |
| ---- | --------------------------------------------- | ---- |
| 1    | table, posting route, tests 1 to 3, 5, 6      | ~350 |
| 2    | the Reports form, list with redaction, test 4 | ~300 |

## Consequences

- **Easier:** salary cost is in the books, and only the right roles see it.
- **Harder:** the cash forecast's salary line uses averages (plan 3.3), not a fixed amount.
- **Undo:** before go-live, drop the table in a new migration.

## Open questions (decided)

1. ~~Allow "accrued" in release 1?~~ **Decided by Munif, 21 Nov:** no. Cash and bank only; accruals later.
2. ~~Who may enter salaries?~~ **Decided by Munif, 21 Nov:** Owner and Accountant.
3. ~~Salary as an expense or its own table?~~ **Decided by Munif, 21 Nov:** its own table.
4. **Decided by Munif, 21 Nov:** the Activity Log records **who viewed salary data**. Every response that includes
   salary amounts writes one `view_sensitive` event (ADR 0032) with the viewer and the entity, never the amounts.

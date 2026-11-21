# 0039: Plan for the financial statements (D10)

| Field               | Value                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------- |
| Status              | Proposed                                                                               |
| Date                | 2026-11-21                                                                             |
| Deciders            | Munif, Farhan                                                                          |
| Owner               | Munif (Accounting; plan row D10)                                                       |
| Spec / roadmap refs | spec A-13, A-20, C-05, RP-02, RP-04; CLAUDE.md invariant 1; ADR 0013, 0023, 0033, 0035 |

## Context

**A-20:** trial balance, profit and loss, balance sheet, general ledger and day book. They must agree with the
ledger exactly (C-05, RP-02).

This plan is read-only: it reads journals and lines, and writes nothing. It's planned because it defines what the
figures mean, and because profit is a hidden figure (ADR 0033). No migration.

## Decision

### Reports, each a read-only tenant route (one business, `{ readOnly: true }`)

| Report          | Definition                                                                                               |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| Trial balance   | per account, debits and credits for the period, and the closing balance; total debits = total credits    |
| Profit and loss | `income` minus `expense` accounts for the period, by account; net profit. Optionally by branch           |
| Balance sheet   | `asset`, `liability` and `equity` balances at a date, plus profit to date; assets = liabilities + equity |
| General ledger  | one account's lines for a period, with running balance and source document links                         |
| Day book        | every journal on a date, with its lines                                                                  |

- **Ledger only:** every figure is a sum over `journal_line` joined to `account`, never a cache. Sums are summed
  in SQL `numeric` and returned as money strings. Totals that combine report rows go through the shared money
  helpers.
- **Hidden fields:** net profit and margin are tagged `profit` (ADR 0033). Salary lines are tagged `salary`.
  Opening P&L itself needs `report.profit.view`.
- **Period:** from and to dates (Asia/Dhaka). A locked month (ADR 0035) is marked "final".
- **Export:** CSV that opens in Excel (plan 2.10), built from the same response, so it gets the same redaction.
- **Across businesses** (group view, O-08) is cut from release 1 (plan 9); one business at a time.

## Invariants touched

1 (the ledger is the truth; reports agree with it), and permissions (hidden profit and salary).

## Tests to write first

1. On a seeded set of journals, the trial balance's total debits equal its total credits.
2. Balance sheet: assets = liabilities + equity + profit to date, at several dates.
3. P&L net profit equals income minus expense, and equals the change in retained profit on the balance sheet.
4. General ledger running balance ends at the trial balance's figure for that account.
5. Day book lists exactly the journals of that date, including reversals.
6. Without `report.profit.view`, P&L can't be opened and profit is absent elsewhere; without
   `accounting.salary.view`, salary lines are absent but net profit remains (RP-04).
7. Isolation: business Y can't read X's statements; the route's transaction is read-only.

## Dependencies

- ADR 0013 (#39), ADR 0033 (#72), ADR 0035 (#74), ADR 0038 (salary tag).
- ADR 0023 (#61), for the read-only route pattern.

## Size and PR split

| Part | Contents                                                  | Size |
| ---- | --------------------------------------------------------- | ---- |
| 1    | trial balance, day book, general ledger, tests 1, 4, 5, 7 | ~350 |
| 2    | P&L, balance sheet, redaction, export, tests 2, 3, 6      | ~400 |

## Consequences

- **Easier:** the accountant can trust the statements, because they're the ledger.
- **Harder:** large periods are computed live; a summary table can come later if they get slow.
- **Undo:** remove the routes; no schema change.

## Open questions (decided)

1. ~~Equity section?~~ **Decided by Munif, 21 Nov:** simple **capital plus retained earnings**, with current profit
   shown as part of retained earnings until a year-end close exists. ⚠ **Flagged for the owner's accountant** to
   confirm before go-live.
2. ~~P&L by branch in release 1?~~ **Decided by Munif, 21 Nov:** yes, as a column option.
3. ~~Which roles see the statements?~~ **Decided by Munif, 21 Nov:** Owner and Accountant see all statements;
   Business Manager the trial balance only.

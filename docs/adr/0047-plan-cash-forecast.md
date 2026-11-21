# 0047: Plan for the cash forecast (F5)

| Field               | Value                                                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Status              | Proposed                                                                                                                   |
| Date                | 2026-11-21                                                                                                                 |
| Deciders            | Munif, Farhan                                                                                                              |
| Owner               | Munif (Report). Dues and promises (Party, Sales) and supplier bills (Purchase) are Farhan's sources                        |
| Spec / roadmap refs | spec D-01, A-20, CR-05, App. A §1; CLAUDE.md invariant 1, money and date rules; ADR 0033, 0037, 0038, 0045, 0046; plan 3.3 |

## Context

The Owner Dashboard's Financial Health card includes a cash forecast (D-01, Appendix A §1). Plan 3.3 designs it:
read-only, per business and branch, 1 to 3 months ahead in weekly buckets, from posted balances and what is due.

It reads hidden salary figures and several modules' data, so it is planned here. It adds no table and posts
nothing. No code is in this PR.

## Decision

### 1. The lines (all money as strings, arithmetic through `shared/src/utils/money`)

| Line                       | Source (owner)                                                                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Opening**                | today's balances of the `cash`, `bank` and `mobile_money` account roles, from posted journals (ADR 0013)                                 |
| + **Expected collections** | open customer dues by due date (ADR 0026, Farhan); a promise-to-pay date (CR-05, F1) replaces the due date                               |
| − **Supplier bills due**   | open purchase bills by due date (ADR 0028, Farhan)                                                                                       |
| − **Recurring expenses**   | each active `recurring_expense` occurrence in the horizon (ADR 0037)                                                                     |
| − **Salaries**             | per active staff member, the average monthly total of their last 3 months' salary entries (ADR 0038), on the recurring settings' due day |
| = **Closing** per week     | carried into the next week's opening                                                                                                     |
| **Uncertain** (separate)   | dues already overdue today: shown on their own line, **not** added to expected collections                                               |

- **Weeks** are business weeks in Asia/Dhaka (question 1); the horizon is 4, 8 or 13 weeks (1 to 3 months).
- A recurring expense **never posts by itself**; on its due day it is an Action Center item (ADR 0037, 0045).
- Every line opens its source: the invoices, bills, recurring settings or salary entries behind it, through each
  module's list with the same filter (D-02).

### 2. How it reads

- `CashForecastReport implements IReport` (ADR 0046), key `cash_forecast`, one route `GET /v1/reports/cash_forecast
?weeks=&branchId=`.
- Each source is a read contract its owner provides, in the request's read-only transaction under the caller's RLS:
  `IDuesForecastSource` (Farhan), `IPayablesForecastSource` (Farhan), `IRecurringExpenseSource` and
  `ISalaryAverageSource` (Accounting, Munif). The opening comes from the ledger only (invariant 1).
- Nothing is cached or stored; every open recomputes it.

### 3. Who sees it

- The salaries line is a hidden figure. Because the closing totals include it, a role that may not see salary
  could work it out by subtraction, so **the whole forecast needs `report.forecast.view`**, given to Owner and
  Accountant by default (question 2).

## Invariants touched

1 (the opening is the ledger's posted balance), hidden fields (salary), tenancy (sources run under the caller's
RLS), money and date rules.

## Tests to write first

1. Opening equals the sum of the `cash`, `bank` and `mobile_money` account balances from posted journals for that
   business and branch.
2. A due on Tuesday of week 2 lands in week 2; with a promise date in week 3 it moves to week 3; a due overdue
   today is on the Uncertain line and in no week.
3. A supplier bill due in week 1 reduces week 1; a paid bill doesn't appear.
4. A monthly recurring expense on day 5 appears once in each month of the horizon; an inactive one or one past
   `ends_on` doesn't.
5. Salaries: a staff member with ৳20,000.00, ৳22,000.00 and ৳24,000.00 in the last three months contributes
   ৳22,000.00 on the due day; someone with one month only contributes that month's total.
6. Each week's closing equals its opening plus its lines, in paisa, with no rounding drift.
7. A Business Manager (without `report.forecast.view`) gets `403`; an Owner sees every line.
8. Isolation: business Y gets nothing of X; a branch-2 user's forecast has no branch-1 figures.
9. The route runs in a read-only transaction and writes nothing.

## Dependencies

- ADR 0013 (#39), 0026 (#64), 0028 (#66), 0037 (#76), 0038 (#77), 0046 (#88). CR-05's promise dates come with F1
  (Farhan); until then expected collections use due dates only.

## Size and PR split

| Part | Contents                                                               | Size |
| ---- | ---------------------------------------------------------------------- | ---- |
| 1    | the report class, opening, recurring and salary lines; tests 1, 4 to 9 | ~350 |
| 2    | dues, promises and bills sources (with Farhan); tests 2, 3             | ~250 |

## Consequences

- **Easier:** the owner sees cash pressure weeks ahead from the same figures the ledger holds.
- **Harder:** the forecast is only as good as due dates and promises; overdue dues are kept apart so they don't
  flatter it.
- **Undo:** remove the report class; nothing is stored.

## Open questions (with recommended answers)

1. **Munif:** which day does a forecast week start? **Recommended:** Saturday (Saturday to Friday), matching a
   showroom's trading week in Bangladesh, where Friday is the weekly holiday.
2. **Munif:** who sees the forecast? **Recommended:** Owner and Accountant only, because its totals reveal salaries.
   A Business Manager version without the salary line and totals can come later if asked.
3. **Munif:** expected collections at 100 % of the due amount, or discounted by each customer's payment history?
   **Recommended:** 100 % in release 1, with overdue dues kept apart; a likelihood weighting needs data the system
   doesn't have yet.

# 0046: Plan for the standard report pack with previous-period comparison (F4)

| Field               | Value                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| Status              | Proposed                                                                                          |
| Date                | 2026-11-21                                                                                        |
| Deciders            | Munif, Farhan                                                                                     |
| Owner               | Munif (Report). Views over Sales, Purchase and Party tables need Farhan's review                  |
| Spec / roadmap refs | spec RP-01 to RP-05, C-05, C-06, C-17; CLAUDE.md money and date rules; ADR 0023, 0033, 0039, 0043 |

The build plan marked F4 "no ADR". It is planned here because it adds database views over both developers' tables
and fixes how every report is checked against the ledger.

## Context

- **RP-01:** reports for sales, purchases, stock, dues, supplier payables, expenses, profit by product, branch and
  salesperson, daily closing and VAT.
- **RP-02:** report totals equal the general ledger and the source modules for the same period.
- **RP-04:** cost, profit and salary appear only for permitted roles, in reports and exports.
- **RP-05:** every report filters by business, branch and date range and can compare with the previous period.
- ADR 0023 (#61) reads the dashboard live from the ledger through `security_invoker` views; its open question 1
  (live queries or `report_snapshot`) applies here too. ADR 0039 (#78) covers the financial statements.

No code is in this PR.

## Decision

### 1. One class per report (open/closed)

```ts
interface IReport {
  key: ReportKey; // 'sales', 'stock', ...
  permission: PermissionCode; // to open it at all
  columns: ReportColumn[]; // each with a Zod type and, if any, its hidden-field tag (ADR 0033)
  run(scope: TenantScope, filter: ReportFilter): Promise<ReportRows>;
}
// ReportFilter: { businessIds, branchIds?, from, to, compare: 'none' | 'previous_period', groupBy? }
```

One route serves them all: `GET /v1/reports/:key`. It checks the report's permission, runs it in the request's
read-only transaction, and redacts tagged columns (ADR 0033) before answering. Exports use the same response
(ADR 0043), so a hidden figure can't reach a CSV.

### 2. The release 1 pack

| Report                                   | Reads                                       | Owner of the data | Hidden columns                          |
| ---------------------------------------- | ------------------------------------------- | ----------------- | --------------------------------------- |
| Sales                                    | posted invoices and returns                 | Farhan            | cost, margin                            |
| Purchases                                | posted purchase bills and returns           | Farhan            | none                                    |
| Stock on hand and value                  | `stock_balance`, `stock_cost` (ADR 0021)    | Munif             | value, cost                             |
| Customer dues (aged)                     | the receivable ledger by party              | Farhan            | none                                    |
| Supplier payables (aged)                 | the payable ledger by supplier              | Farhan            | none                                    |
| Expenses                                 | posted expenses by category (ADR 0037)      | Munif             | salary lines                            |
| Profit by product / branch / salesperson | posted sales lines with their cost          | Farhan, Munif     | the whole report (`report.profit.view`) |
| Daily closing                            | day close per branch (ADR 0017, A17)        | Munif             | none                                    |
| VAT                                      | **not in release 1**: waits for D12 and Q15 | Munif             | –                                       |

- **Each report reads one `security_invoker` view** in `dal/sql/views/report_<key>.sql`, so it runs with the
  caller's RLS, never the owner's. A source test keeps each view equal to its migration (the ADR 0023 pattern).
- **Views over Farhan's tables are reviewed by him**; a column change in Sales or Purchase that breaks a view fails
  that view's test.
- Money stays `numeric` in SQL and becomes a string in the API; any sum or difference in TypeScript uses
  `shared/src/utils/money` only.

### 3. Filters and the previous period (RP-05)

- **Dates are business dates in Asia/Dhaka**, inclusive: `from` 1 Nov to `to` 30 Nov means every document whose
  Dhaka date is in November.
- **The previous period has the same length and ends the day before `from`:** 5 to 11 November compares with 29
  October to 4 November (7 days). When `from` and `to` are a whole calendar month, it compares with the whole
  previous month instead: November with all of October (question 1).
- The comparison adds `previous` and `change` (amount and percent; percent is absent when the previous value is 0).
- Business: one, or several the caller may see (cross-business totals per CLAUDE.md come later with
  `report_snapshot`; ADR 0023 question 1). Branch: optional, within the caller's scope.

### 4. Reports agree with the ledger (RP-02, C-05)

Every report that shows money has a **ledger test**: seeded journals and documents for a period, and the report's
total equals the matching ledger account total for the same filter (sales = revenue accounts; dues = the
receivable control account; stock value = the `inventory` account; expenses = the expense accounts). These run in
CI; the nightly check (C-13, ADR 0035) runs the same comparisons on real data.

### 5. Size limits

A report returns at most 5,000 rows (ADR 0005's over-limit error beyond that, "narrow the filter"); summaries group
before the limit. Each report's view gets the index its filter needs, and a timing test with seeded volume (C-17).

## Invariants touched

1 (figures from the ledger and posted documents only), hidden fields (RP-04), tenancy (`security_invoker` views
under the caller's RLS), money and date rules.

## Tests to write first

1. Each money report's total equals its ledger account total for the same business, branch and period.
2. A Cashier can't open the profit report (`403`); a Business Manager without `product.cost.view` gets the stock
   report without value or cost columns, and its CSV has none either.
3. Previous period: 1 to 30 Nov compares with 1 to 31 Oct (whole month); 5 to 11 Nov compares with 29 Oct to 4
   Nov; percent change is absent when the previous value is 0.
4. A document posted at 23:30 on 30 Nov Dhaka time (17:30 UTC) is in November; one at 00:30 on 1 Dec Dhaka time
   (18:30 UTC on 30 Nov) is in December.
5. Each view is `security_invoker` (catalog test) and `erp_app` has `SELECT` only.
6. Isolation: a user of business Y gets no rows of X with X's ids in the filter; a branch-2 user gets no branch-1
   rows.
7. More than 5,000 rows gives the over-limit error; each report's first page returns within 2 seconds with seeded
   volume.

## Dependencies

- The data: ADR 0021 (#59), 0022 (#60), 0026 (#64), 0028 (#66), 0037 (#76), 0017 (#44). **Each report ships when
  its data exists**; the route and the first two reports come first.
- ADR 0033 (#72) for permissions and redaction; ADR 0043 (#85) for export; ADR 0023 (#61) question 1.

## Size and PR split

| Part | Contents                                                                                   | Size |
| ---- | ------------------------------------------------------------------------------------------ | ---- |
| 1    | `IReport`, the route, filters and comparison, the stock and expenses reports; tests 2 to 7 | ~400 |
| 2    | sales, purchases, dues, payables (views reviewed by Farhan); test 1 for each               | ~400 |
| 3    | profit by product, branch, salesperson; daily closing; test 1 for each                     | ~350 |

## Consequences

- **Easier:** a new report is one class and one view; every report is checked against the ledger in CI.
- **Harder:** a change to a source table must keep its report view working; the view test catches it.
- **Undo:** drop the views in a new migration; nothing writes data.

## Open questions (with recommended answers)

1. **Munif:** the previous period for a whole month: the previous calendar month (October has 31 days) or the
   same number of days? **Recommended:** the previous calendar month when the range is a whole month, otherwise the
   same number of days.
2. **Munif:** VAT report in release 1? **Recommended:** no, until D12 and Q15 settle whether Moto Mart files VAT
   through this system.
3. **Farhan:** "profit by salesperson" needs a salesperson on each invoice. Is that on ADR 0022's invoice?
   **Recommended:** a nullable `salesperson_id` on the invoice, defaulting to the user who made it.

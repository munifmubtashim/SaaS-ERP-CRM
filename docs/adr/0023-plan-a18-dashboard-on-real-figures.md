# 0023: Plan for A18, the owner dashboard on real figures

| Field               | Value                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| Status              | Proposed                                                                                                   |
| Date                | 2026-11-21                                                                                                 |
| Deciders            | Munif, Farhan                                                                                              |
| Owner               | Munif (Report; plan row A18, queue task M6)                                                                |
| Spec / roadmap refs | spec D-01, D-06, C-05, O-09; CLAUDE.md tenancy rules; ADR 0005 Q2, 0007, 0013, 0016; #13, #46, #56; plan 9 |

## Context

The owner dashboard (#13, with #46 and #56 on top) runs on a mock today. Its shape is already shared and on
`main`, in `report.schema.ts`:

- `asOf`;
- totals of `dues` and `collectionsToday`;
- one row per business with the same two figures.

A18 replaces the mock with real figures, so the demo's steps 2 and 7 (#49) show the ledger.

**Why it needs a plan.** It's the first route that reads **several businesses at once**. That's a tenancy
change: ADR 0005 Q2 allows a multi-business scope only on read-only routes, and CLAUDE.md says group views are
`WITH (security_invoker = true)` and always filter on the organization and the caller's allowed businesses.
CLAUDE.md requires an agreed plan before tenancy or migration code. No code is in this PR.

**A conflict to settle (open question 1).**

- CLAUDE.md says "Cross-business totals come from `report_snapshot`".
- The feature plan (section 9) says release 1's dashboard runs on live queries, with no `report_snapshot`
  until volume needs it (the worker writes it, and the worker is deferred, ADR 0003).

This plan follows the feature plan. It needs both developers' agreement, and a CLAUDE.md change in its own PR.

## Decision

### 1. The figures, from the ledger only (invariant 1, spec C-05)

| Figure             | Definition                                                                                                                                                                                                                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dues`             | per business: the balance (debits − credits) of the accounts mapped to `receivable` (ADR 0012, 0013)                                                                                                                                                                                                        |
| `collectionsToday` | per business: debits **minus credits** on `cash`, `bank`, `mobile_money` and `card_clearing`, in journals with `source_type = 'sales_payment'` and in reversals whose `reversal_of` is a `sales_payment` journal, with `journal_date` = today in Asia/Dhaka (Farhan's point on #61, agreed by Munif 22 Nov) |
| totals             | the sum of the business rows, through `sumMoney` in the Manager                                                                                                                                                                                                                                             |
| `asOf`             | the time the query ran (live figures)                                                                                                                                                                                                                                                                       |

- **Advances** (`customer_advance`, a liability) aren't dues and aren't subtracted from them. They can be a
  separate figure later.
- **"Today"** is the Dhaka business date, from the shared business-date helper (plan B15).
- **A voided payment comes off.** A void posts a reversal (ADR 0016 section 5, ADR 0013), so a payment voided
  the same day nets to zero in `collectionsToday`. A payment voided on a later day stays in its own day's figure,
  and the reversal lowers the figure on the day of the void, by its `journal_date`.

### 2. One view, one route

- **View `report_owner_dashboard`** (Report, `dal/sql/views/report.sql`, migration `report_views`):
  - `WITH (security_invoker = true)`, so it reads with the caller's RLS, never the owner's;
  - one row per business, with the two figures;
  - its `WHERE` filters on `organization_id = (SELECT app_organization_id())` and
    `business_id = ANY ((SELECT app_business_ids())::uuid[])`, even though the underlying tables' RLS already
    does, as CLAUDE.md requires for group views;
  - `erp_app` gets `SELECT` on the view only.
- **Route `GET /v1/reports/owner-dashboard`:** a tenant route with `{ readOnly: true }` (#8). Its scope lists every
  business the caller may see (from `user_scope`, A6). The transaction runs `READ ONLY`, so any write in it fails
  (ADR 0005 Q2).
- **Who may call it:** Owner, and Business Manager for their own businesses (D-03). The figures aren't hidden
  fields; profit isn't on this dashboard yet.
- **Code:** `ReportQuery.ownerDashboard()` reads the view; `ReportManager` sums the totals with the shared money
  helpers and builds the shared schema's shape; the frontend swaps `MockReportService` for `ReportService` (#13).

### 3. What this doesn't do

- No `report_snapshot` table and no worker (see open question 1).
- No figures beyond the two in the schema. The Main design's cash, ageing, revenue and profit cards each need a
  definition and their own test, and come in later PRs, each with its own view or query.

## Tests to write first (real Postgres; run to see them fail)

1. **Figures equal the ledger** (C-05): after seeded journals, each business's `dues` equals its `receivable`
   balance, and `collectionsToday` equals today's payment debits minus today's payment-reversal credits. The
   totals equal the sum of the rows.
   - **Voided the same day:** a ৳50,000.00 payment by `mobile_money`, voided ten minutes later, leaves
     `collectionsToday` where it was before the payment (Farhan's example on #61).
   - **Voided the next day:** the payment counts ৳50,000.00 on its own day; on the day of the void,
     `collectionsToday` is ৳50,000.00 lower than that day's other payments.
2. **Today is Dhaka's day:** a payment at 23:30 UTC on 20 Nov counts on 21 Nov.
3. **Isolation:**
   - an Owner of organization A sees only A's businesses;
   - a Business Manager of business X sees only X;
   - nobody sees organization B's rows, even with B's business id in the request.
4. **Read-only:** a write attempted inside the route's transaction fails.
5. **The view is `security_invoker`:** a catalog test checks the option, and that `erp_app` has `SELECT` only.
6. **Pooled connection:** after the request, the same connection returns nothing until a scope is set again.
7. **No scope:** the view, read outside a scope, raises (the RLS functions raise when unset).
8. **Money as strings:** every figure in the response matches the money pattern; no number is a float.
9. One isolation case for the route in `api/test/isolation/cases.ts`.

## Migration steps (written here, applied in the PR, not now)

1. Merge `main`; tell Farhan `report_views` is in flight. It needs `accounting_core` (ADR 0013) and the payment
   journals (ADR 0016).
2. Write the view in `dal/sql/views/report.sql`, with a source test that keeps it equal to the migration.
3. `npm run db:migrate:new -- report_views`; add the view and its grant; review the SQL.
4. `npm run db:migrate:check`; `db:migrate:deploy` on a throwaway Postgres; `test:integration`;
   `test:isolation`.

## Size and PR split

| Part | Branch                | Contents                                                                    | Size (approx.) | Needs first                           |
| ---- | --------------------- | --------------------------------------------------------------------------- | -------------- | ------------------------------------- |
| 1    | `feat/report-views`   | the view, its migration, `ReportQuery`, tests 1, 2, 5, 7, 8                 | ~300           | ADR 0013 part 2, ADR 0016 part 1, B15 |
| 2    | `feat/dashboard-real` | `ReportManager`, the route, isolation case, frontend swap, tests 3, 4, 6, 9 | ~300           | part 1, #8, A6, #13                   |

## Blocked by

- **ADR 0013** (#39) and **ADR 0016** (#43): the journals and payment journals the figures read.
- **#8** (the `readOnly` route option) and **A6** (the multi-business scope from `user_scope`).
- **B15:** the business-date helper.
- **#13:** the dashboard screen.

## Consequences

- **Easier:** the dashboard shows the same numbers the accountant sees, live.
- **Harder:** each new card needs its own definition and test against the ledger. Live queries will slow down as
  volume grows, which is when `report_snapshot` and the worker come in.
- **Keep true:** figures only from the ledger; read-only transaction; the view filters on organization and
  allowed businesses.
- **Undo:** drop the view in a new migration and switch the frontend back to the mock.

## Open questions

1. **Both, CLAUDE.md conflict:** live queries for release 1 (the feature plan), or `report_snapshot` now
   (CLAUDE.md)? Recommended: live, with CLAUDE.md amended in its own PR to say "from `report_snapshot` once the
   worker exists; live queries over a `security_invoker` view until then".
2. **Munif:** should Business Manager see the dashboard for their own business, or only Owner? Recommended: both,
   per D-03.
3. **Farhan:** does `collectionsToday` include advances (ADR 0016's `customer_advance` credits)? Recommended: yes,
   it's money received today.

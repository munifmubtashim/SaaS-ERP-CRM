# Review guide, 21 Nov 2026

**For:** Farhan. **Written by:** Munif (with Claude Code), from the open PR list, the branches and the feature
plan on 21 Nov. It's a snapshot; delete it once the queue is cleared.

**Open questions** for each plan, with recommendations, are in `docs/decisions-2026-11-21.md`.

**What counts as the critical path here:** A3 (organization tables), A4 (access tables), A5 (login), A6
(tenant middleware), A11 (party tables) and the customer list.

**Key:**

- **Risk tier:**
  - **low:** UI on mock data, or docs;
  - **medium:** a plan ADR for a high-risk area, or UI that changes the app's wiring (`services/index.ts`,
    `router.tsx`, the app shell);
  - **high:** ledger, stock, RLS, auth, migrations or shared code.
- **Minutes:** a rough reading time for a careful review, tests included.
- **Needs update:** the branch is behind `main` (or behind its base, for a stacked PR) and needs `main`
  merged in before it can merge. Never a rebase.
- **Reviewer:** Munif's PRs are for Farhan; Farhan's are for Munif.

## 0. Code PRs in merge order

The built code, stacked: each PR is based on the one before it, so **review and merge in this order**. After one
merges, retarget the next to `main` (its diff then shrinks to its own lines). All are drafts; Munif undrafts each
when it's next.

**Slow review:** every one of these touches tenancy, RLS, roles, permissions or a migration, so CLAUDE.md asks for
a slow, line-by-line human review (the AI review is extra, never the approval). The minutes allow for that.

| Order | PR  | What                                                                  | Own size (lines)                                               | Min | Unlocks once merged                                                                                              |
| ----- | --- | --------------------------------------------------------------------- | -------------------------------------------------------------- | --- | ---------------------------------------------------------------------------------------------------------------- |
| 1     | #29 | `uuid_v7()` function (migration)                                      | ~250                                                           | 35  | the default for every new id; #80 can merge                                                                      |
| 2     | #26 | permission codes and the five roles (shared)                          | ~165                                                           | 25  | `RoleCode` for #92's Owner check; Party's codes (#52); the A4 seed                                               |
| 3     | #28 | `erp_provisioner` role, init script, lint guard                       | ~215                                                           | 35  | the role #81 grants to; CI creates it                                                                            |
| 4     | #80 | organization tree tables with forced RLS (ADR 0009 part 1)            | ~960 (243 are the migration's copy of the SQL source; skim it) | 75  | the first tenant tables; every later table's `business_id` and `branch_id` foreign keys; A11's party table       |
| 5     | #81 | provisioner grants and policies, `branch_is_active` (ADR 0009 part 2) | ~325 after #28 merges                                          | 40  | creating a business or branch at all; `branch_is_active` for every branch-scoped table's `WITH CHECK`            |
| 6     | #82 | `ProvisioningQuery` and `PROVISIONING_DATABASE_URL` (ADR 0010 part 1) | ~570                                                           | 50  | the dal half of provisioning; a lint exemption in `eslint.config.mjs` (shared)                                   |
| 7     | #92 | Owner-only creation in `OrganizationManager` (ADR 0010 part 2)        | ~540 after #26 merges                                          | 45  | the businessLogic half; with #93 (CLAUDE.md route kind, docs, 5 minutes) merged first, the provisioning route PR |

**About 5 hours in all**, best split over two sittings: #29 to #28 (about 1.5 hours), then #80 to #92 (about 3.5
hours). #93, the one-paragraph CLAUDE.md change for the `provisioning` route kind, needs both reviewers and should
merge before the route PR that follows #92.

## 1. Review first for the demo (Munif's order, 21 Nov)

In this exact order. "When agreed" is what gets built once the plan is agreed (or, for #29, what merging it
unlocks). Minutes are for a careful read.

| Order | PR  | What                                        | Reviewer | Min | When agreed, this gets built                                                                                                             |
| ----- | --- | ------------------------------------------- | -------- | --- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | #29 | `uuid_v7()` function (a build, not a plan)  | Farhan   | 35  | Nothing new: merging it lets #80 (organization tree), #81 and #82 merge, and every later table default its ids to UUID v7                |
| 2     | #45 | ADR 0018 sessions and login                 | Farhan   | 25  | The session table and `AuthQuery` session methods; login with argon2id, lockout and the IP limit; #11's screen on the real API           |
| 3     | #37 | ADR 0011 Idempotency-Key (owner Farhan)     | Farhan   | 15  | Nothing on its own: it fixes the rule (claim the key first, replay a repeat, refuse a reused key) that #40 builds                        |
| 4     | #38 | ADR 0012 module contracts                   | Farhan   | 20  | The `IPostingService` and `IStockService` contracts and the account-role list that every posting module uses                             |
| 5     | #39 | ADR 0013 journal engine (A13)               | Farhan   | 30  | `account`, `journal`, `journal_line`, `account_role`; the balanced-at-commit and immutability triggers; `PostingService`; accounts setup |
| 6     | #40 | ADR 0014 building idempotency (A14)         | Farhan   | 15  | The `idempotency_key` table and the route-wrapper option on #8                                                                           |
| 7     | #41 | ADR 0015 number series (A14a)               | Farhan   | 20  | The `number_series` table and gapless allocator, with the business-wide `party_code` series that A11 part 3 needs                        |
| 8     | #43 | ADR 0016 payment posting (owner Farhan)     | Farhan   | 20  | A payment and its balanced journal in one transaction, with each payment method as its own class                                         |
| 9     | #58 | ADR 0020 product and bike unit tables       | Farhan   | 30  | `product`; `serial_unit` with its status trigger and `IUnitSale`; the Vehicle pack's `vehicle_unit`; #35 and #36 on real data            |
| 10    | #59 | ADR 0021 stock ledger (amended 21 Nov)      | Farhan   | 40  | `stock_movement`, `stock_balance`, `stock_cost`, `StockService.move` with atomic decrements, and the business In transit rules           |
| 11    | #60 | ADR 0022 sale posting (owner Farhan)        | Farhan   | 40  | Invoice schemas, `invoice` tables, `SalesManager.postInvoice` (invoice, journal and stock in one transaction), POS on the real route     |
| 12    | #61 | ADR 0023 dashboard on real figures (A18)    | Farhan   | 20  | The `security_invoker` report view, `ReportManager` and route, and the dashboard swapped from mock to ledger figures                     |
| 13    | #64 | ADR 0026 dues and payment routes (Farhan's) | Munif    | 30  | Payment permission codes; `sales_payment` and `PaymentQuery`; `POST /v1/payments` with A16's posting; #53's screen on the real API       |

**About 5 hours for Farhan (items 1 to 12) and 30 minutes for Munif (item 13).** The money and stock plans (#39,
#43, #59, #60) get the slow, line-by-line read CLAUDE.md asks for.

## 2. After the demo: every other plan PR

Agreed already, no review needed: **#27** ADR 0008 amendment, **#31** ADR 0009 organization tables (built as #80,
#81), **#32** ADR 0010 provisioning path (part 1 built as #82).

| PR  | Plan                                        | Purpose, in one line                                                                          |
| --- | ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| #14 | ADR 0005 and 0006 status                    | Marks the tenancy and Party ADRs Accepted                                                     |
| #16 | ADR 0007 active business                    | The business and branch come from each request's headers                                      |
| #20 | Feature build plan                          | The map of every feature, owner and PR                                                        |
| #23 | ADR 0001 Moto Mart decisions                | Release phases, spec deviations, registration fees as a liability                             |
| #44 | ADR 0017 day close                          | Branch day close and the day lock in the database                                             |
| #52 | ADR 0006 updates (Farhan's)                 | `staff` for `assigned_to`, per-kind permission codes, credit limit and guarantor in release 1 |
| #54 | ADR 0019 party table (Farhan's)             | The `party` table, create, edit and the duplicate-phone warning                               |
| #62 | ADR 0024 credit limit (Farhan's)            | Customer credit limits and credit holds                                                       |
| #63 | ADR 0025 guarantors (Farhan's)              | Guarantors and relations between parties                                                      |
| #65 | ADR 0027 instalments (Farhan's)             | Instalment plans and bank financing                                                           |
| #66 | ADR 0028 purchase documents (Farhan's)      | Purchase order, receipt, supplier bill, payment and return                                    |
| #67 | ADR 0029 service jobs (Farhan's)            | Job cards, parts from stock, the service invoice and warranty                                 |
| #68 | ADR 0030 approvals (Farhan's)               | Approval rules and requests, with no self-approval                                            |
| #69 | ADR 0031 search (Farhan's)                  | Search by part, phone, chassis and number                                                     |
| #70 | ADR-number map                              | Which ADR number each reserved plan row actually got                                          |
| #71 | ADR 0032 activity record                    | The append-only `audit_event` log of who did what                                             |
| #72 | ADR 0033 permissions and hidden fields      | A permission on every route; cost, profit and salary removed from responses and exports       |
| #73 | ADR 0034 stock by location                  | Locations per branch, Showroom and Warehouse figures, one business In transit location        |
| #74 | ADR 0035 month lock and integrity check     | Locking a month, and the nightly check that ledger and stock agree                            |
| #75 | ADR 0036 chart of accounts, manual journals | The accounts screens and approved manual journals                                             |
| #76 | ADR 0037 expenses                           | Expenses, approval limits and recurring expenses                                              |
| #77 | ADR 0038 salary entries                     | Salary entries in their own table, viewing recorded                                           |
| #78 | ADR 0039 financial statements               | Trial balance, profit and loss, balance sheet from the ledger                                 |
| #79 | ADR 0040 stock adjustments and counts       | Approved adjustments and physical counts per location                                         |
| #83 | ADR 0041 stock transfers                    | Transfers between branches, each branch confirming its own side                               |
| #84 | ADR 0042 reorder rules                      | Per-branch reorder levels, Low and Out of stock, the `stock.low` event                        |
| #85 | ADR 0043 attachments and exports            | Customer documents in storage, restricted NID copies, CSV and PDF exports                     |
| #86 | ADR 0044 outbox and notifications           | The event outbox and per-user in-app notifications                                            |
| #87 | ADR 0045 Action Center                      | Exceptions from every module, with assign, due date, resolve and history                      |
| #88 | ADR 0046 standard reports                   | The report pack, each total checked against the ledger                                        |
| #89 | ADR 0047 cash forecast                      | A weekly cash forecast from the ledger and what is due                                        |
| #90 | ADR 0048 vehicle service extras             | Plate, odometer, km warranty and service reminders (Vehicle pack)                             |
| #91 | ADR 0049 VAT summary                        | VAT accounts and the monthly summary, only if the business is VAT registered (Q15)            |

Builds and screens that aren't plans (#8, #9, #11, #12, #13, #26, #28, #33 to #36, #42, #46, #47, #51, #53, #55,
#56, #80 to #82) are in the table below, with their own risk and minutes.

## 3. All open PRs (reference, as of the morning of 21 Nov)

| #   | Title                                      | Author                 | Base   | Summary                                                                                                                | Risk                       | Min | Critical path?                                                          | Built on       | Needs update              |
| --- | ------------------------------------------ | ---------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------- | -------------------------- | --- | ----------------------------------------------------------------------- | -------------- | ------------------------- |
| 6   | Work queue for the interview slice         | Munif                  | `main` | `docs/queue.md`, the slice task list (largely replaced by the feature plan, #20)                                       | low                        | 5   | no                                                                      | —              | yes (`main`)              |
| 8   | Tenant route wrapper                       | Munif                  | `main` | Runs each tenant route in one scoped transaction; Controllers return `{status, body}`; read-only multi-business scopes | high (tenancy, shared)     | 60  | **yes: A5, A6**                                                         | —              | no (`main` merged 21 Nov) |
| 9   | Route stubs take the wrappers              | Munif                  | #8     | Every module's route stub uses the #8 wrappers                                                                         | medium (shared `index.ts`) | 15  | yes: A6 (after #8)                                                      | #8             | yes (base #8 moved)       |
| 11  | Login screen and session guard             | Munif                  | `main` | Login screen, guard and sign-out on a mock auth service                                                                | medium (wiring)            | 40  | yes: A5 screen                                                          | —              | yes (`main`)              |
| 12  | Business and branch switcher               | Munif                  | `main` | Header switcher on a mock; the active business per tab (ADR 0007)                                                      | medium (app shell)         | 35  | yes: A6 screen side                                                     | —              | yes (`main`)              |
| 13  | Owner dashboard on mock figures            | Munif                  | `main` | Total dues, collections today and a row per business, on a mock                                                        | low                        | 20  | no                                                                      | —              | no                        |
| 14  | Mark ADR 0005 and 0006 Accepted            | Munif                  | `main` | Status lines only                                                                                                      | low                        | 5   | yes: ADR 0006 for A11                                                   | —              | no                        |
| 16  | ADR 0007: the active business              | Munif                  | `main` | The business and branch come from each request (`X-Business-Id`, `X-Branch-Id`)                                        | medium (tenancy plan)      | 15  | **yes: A6**                                                             | —              | no                        |
| 17  | Demo hosting plan and Docker image         | Munif                  | `main` | Dockerfile, hosting plan and a small api change for the demo                                                           | medium                     | 40  | no                                                                      | —              | yes (`main`)              |
| 20  | Feature build plan                         | Munif                  | `main` | `docs/plans/feature-build-plan.md` and the pages-and-features reference (1,175 lines)                                  | low                        | 60  | no (it's the map)                                                       | —              | yes (`main`)              |
| 23  | ADR 0001: Moto Mart decisions              | Munif                  | `main` | Release phases, spec deviations, registration as a liability                                                           | low                        | 15  | no                                                                      | —              | yes (`main`)              |
| 26  | Permission codes and five roles (A4a)      | Munif                  | `main` | `PERMISSIONS`, the five roles and the default mapping in `shared`                                                      | high (shared, permissions) | 25  | **yes: A4**                                                             | —              | yes (`main`)              |
| 27  | ADR 0008 amendment                         | Munif                  | `main` | Provisioner scope, nullable `created_by`, seeding, `uuid_v7` default, `@@unique` fix                                   | medium (tenancy plan)      | 10  | **yes: A3**                                                             | —              | yes (`main`)              |
| 28  | `erp_provisioner` role (A3a)               | Munif                  | `main` | Least-privilege role, idempotent init script, lint guard                                                               | high (DB roles, shared CI) | 35  | **yes: A3**                                                             | #27 (decision) | yes (`main`)              |
| 29  | `uuid_v7()` function                       | Munif                  | `main` | Migration adding `uuid_v7()` for UUID v7 keys, with clock and ordering tests                                           | high (migration)           | 35  | **yes: A3, A11**                                                        | —              | no                        |
| 30  | `@erp/tools` in CLAUDE.md                  | Munif                  | `main` | One line in the workspace list                                                                                         | low (rules: both review)   | 2   | no                                                                      | —              | no                        |
| 31  | ADR 0009: plan for A3b                     | Munif                  | `main` | Organization tree tables, RLS and the provisioner grants; access tables as A4 parts 3 and 4                            | medium (tenancy plan)      | 25  | **yes: A3, A4. Munif is waiting on this**                               | #27, #28, #29  | no                        |
| 32  | ADR 0010: plan for A3c                     | Munif                  | `main` | The code path that creates a business or branch as `erp_provisioner`                                                   | medium                     | 15  | no (after A3b)                                                          | #31            | no                        |
| 33  | Customer list screen (F1b)                 | Farhan                 | `main` | `/customers` on a mock Party service; search, filters, paging, all states                                              | low                        | 35  | **yes: customer list**                                                  | —              | no                        |
| 34  | Product and stock schemas                  | Munif                  | `main` | Product list and stock-on-hand Zod schemas; quantity string helper                                                     | high (shared)              | 30  | no                                                                      | —              | no                        |
| 35  | Product list screen                        | Munif                  | #34    | `/inventory/products` on a mock                                                                                        | medium (wiring)            | 30  | no                                                                      | #34            | no                        |
| 36  | Stock-on-hand screen                       | Munif                  | #35    | `/inventory` on a mock                                                                                                 | low                        | 25  | no                                                                      | #35            | no                        |
| 37  | ADR 0011: Idempotency-Key (A9)             | Munif (owner: Farhan)  | `main` | Claim the key first, replay on repeat, refuse a reused key                                                             | medium (plan)              | 15  | no                                                                      | —              | no                        |
| 38  | ADR 0012: module contracts (A12)           | Munif                  | `main` | `IPostingService`, `IStockService`; account roles, not account codes                                                   | medium (ledger plan)       | 20  | no                                                                      | —              | no                        |
| 39  | ADR 0013: journal engine (A13)             | Munif                  | `main` | Accounts, journals, lines; balanced-at-commit and immutable triggers                                                   | medium (ledger plan)       | 30  | no                                                                      | #38            | no                        |
| 40  | ADR 0014: building idempotency (A14)       | Munif (owner: Farhan)  | `main` | Where each piece goes; wrapper option on #8                                                                            | medium (plan)              | 15  | no                                                                      | #37, #8        | no                        |
| 41  | ADR 0015: number series (A14a)             | Munif                  | `main` | Gapless numbers with one atomic `UPDATE`; business-wide series for customer codes; formatting never cuts               | medium (plan)              | 20  | **yes: A11 part 3** (its build, A14a, must merge first: customer codes) | #38            | no                        |
| 42  | BaseDTO money and quantity helpers (A10a)  | Farhan                 | `main` | `numeric` to `"12500.00"` and `"1.500"` without rounding; dal unit tests in `npm run check`                            | high (shared dal base)     | 15  | **yes: A11** (DTOs need it)                                             | —              | no                        |
| 43  | ADR 0016: payment posting (A16)            | Munif (owner: Farhan)  | `main` | A payment and its journal in one transaction; method rules as classes                                                  | medium (ledger plan)       | 20  | no                                                                      | #38, #39, #41  | no                        |
| 44  | ADR 0017: day close (A17)                  | Munif (screen: Farhan) | `main` | Branch day close; the day lock in the database                                                                         | medium (ledger plan)       | 25  | no                                                                      | #39, #40       | no                        |
| 45  | ADR 0018: sessions and login               | Munif                  | `main` | Session table, cookie, lockout, argon2id settings, the library                                                         | medium (auth plan)         | 25  | **yes: A4, A5**                                                         | #31            | no                        |
| 46  | Dashboard refresh, 403 and phone layout    | Munif                  | #13    | Fixes a failed refresh hiding the figures; adds Refresh, no-permission and phone layout                                | low                        | 10  | no                                                                      | #13            | no                        |
| 47  | Customer profile, payment and dues schemas | Farhan                 | `main` | Shared schemas for the profile and payment screens                                                                     | high (shared)              | 30  | no (customer profile is next after the list)                            | —              | no                        |
| 51  | Customer profile screen                    | Farhan                 | #33    | `/customers/:id` on mock Party and Sales services                                                                      | low                        | 45  | no                                                                      | #33, #47       | no                        |
| 52  | ADR 0006 updates                           | Farhan                 | `main` | `assigned_to` → `staff`; per-kind permission codes; credit limit and guarantor in release 1                            | medium (permissions plan)  | 15  | **yes: A11**                                                            | —              | no                        |
| 53  | Payment entry form                         | Farhan                 | #51    | A15's screen on a mock Sales service, with a confirm step and `Idempotency-Key`                                        | low                        | 40  | no                                                                      | #51            | no                        |
| 54  | ADR 0019: plan for A11                     | Farhan                 | `main` | The `party` table, RLS, create, edit, duplicate-phone warning                                                          | medium (tenancy plan)      | 25  | **yes: A11**                                                            | #52, #31, #41  | no                        |
| 55  | Filters in the address                     | Munif                  | #36    | Product and stock filters in the query string; stock rows link to the product                                          | low                        | 10  | no                                                                      | #36            | no                        |
| 56  | Dues share on the dashboard                | Munif                  | #46    | Businesses by dues with each one's share (via `allocate`)                                                              | low                        | 10  | no                                                                      | #46            | no                        |

The demo PRs (#48, #49) are in their own section below.

## 4. The demo branch

`feat/demo` is the integration branch for the 29 Nov demo. Nothing from it goes to `main` until it has been
reviewed after the demo. CI runs on PRs into it since #50 (merged 20 Nov).

| Order | PR           | What                                                                                                                                           | Risk                               | Min |
| ----- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | --- |
| 1     | #50 (merged) | CI on PRs into `feat/demo`                                                                                                                     | —                                  | —   |
| 2     | #48          | Invented seed data and a deterministic invoice generator (`tools/src/demo`). `tools` gains a dependency on `@erp/shared` (shared: both review) | high (shared lockfile), low impact | 25  |
| 3     | #49          | The demo script (docs). It overlaps Farhan's F7 task, so he may take it over                                                                   | low                                | 10  |

Both are up to date with `feat/demo` and have green PR checks.

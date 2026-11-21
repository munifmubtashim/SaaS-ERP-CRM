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

## All open PRs

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

## Recommended order

### 1. Must review today: unblocks the critical path

In this order. Each item says what it unblocks.

| Order | PR                                                                    | Reviewer | Min | Unblocks                                                                      |
| ----- | --------------------------------------------------------------------- | -------- | --- | ----------------------------------------------------------------------------- |
| 1     | #29 `uuid_v7()`                                                       | Farhan   | 35  | the default for every new key (A3, A11)                                       |
| 2     | #27 ADR 0008 amendment                                                | Farhan   | 10  | A3 part 1 design                                                              |
| 3     | #31 ADR 0009 (A3b plan)                                               | Farhan   | 25  | **A3: Munif can't start the organization tables until this is agreed**        |
| 4     | #28 `erp_provisioner` role                                            | Farhan   | 35  | A3 part 2 (needs #27)                                                         |
| 5     | #26 permission codes                                                  | Farhan   | 25  | A4 seed, and Party's codes in #52                                             |
| 6     | #45 ADR 0018 sessions and login                                       | Farhan   | 25  | A4 part 3 and A5                                                              |
| 7     | #16 ADR 0007, then #8 tenant wrapper, then #9                         | Farhan   | 90  | A5 and A6 (#9 needs #8 merged into it first)                                  |
| 8     | #41 ADR 0015 number series (A14a plan)                                | Farhan   | 20  | **A11 part 3**: customer codes come from A14a's build, which must merge first |
| 9     | #52 ADR 0006 updates (waiting on Farhan's fixes to six review points) | Munif    | 15  | A11                                                                           |
| 10    | #42 BaseDTO helpers (waiting on Farhan's fixes to four review points) | Munif    | 15  | A11 DTOs                                                                      |
| 11    | #54 ADR 0019 (A11 plan)                                               | Munif    | 25  | A11 (after #52)                                                               |
| 12    | #33 customer list                                                     | Munif    | 35  | the customer list                                                             |

About **4.5 hours** for Farhan (items 1 to 8) and about **1.5 hours** for Munif (items 9 to 12).

**Critical-path order for A11 (updated 21 Nov):** #41's build (A14a, gapless numbers and the business-wide
`party_code` series) must merge **before A11 part 3**, the party table. ADR 0019 (#54) now takes customer codes
from it.

### 2. Safe and quick

Low risk, 15 minutes or less each, independent of each other:

- **#30:** CLAUDE.md workspaces, 2 minutes. It's rules, so it needs both reviewers.
- **#14:** ADR 0005 and 0006 status lines, 5 minutes. Merge before #52, since both touch ADR 0006.
- **#13, then #46, then #56:** the dashboard stack on mocks, about 40 minutes in all. The demo uses it.
- **#55:** product and stock filters, 10 minutes, after #36.
- **#6:** the work queue. Close it if the feature plan (#20) replaces it.

### 3. Can wait until after 29 Nov

- **Plan ADRs for ledger and idempotency:** #37, #38, #39, #40, #43, #44 (#41 moved to group 1). Read them
  together, in that order, about 2 hours. **Move them into group 1 if payments posting a journal is in the 29 Nov demo.**
- **Product and stock screens:** #34, then #35, #36. Shared schemas, then the screens, about 85 minutes.
- **Customer profile and payment screens:** #47, then #51, then #53. About 2 hours (Munif reviews).
- **Login and switcher screens:** #11 and #12. Both need `main` merged first. They become critical when A5 and
  A6 start, and they're needed for the demo, so review them before 28 Nov at the latest.
- **#17** (demo hosting): only matters if the demo is hosted, not run locally.
- **#20, #23, #32:** the plan, the Moto Mart ADR rows, and A3c. Reference and later work.

## The demo branch

`feat/demo` is the integration branch for the 29 Nov demo. Nothing from it goes to `main` until it has been
reviewed after the demo. CI runs on PRs into it since #50 (merged 20 Nov).

| Order | PR           | What                                                                                                                                           | Risk                               | Min |
| ----- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | --- |
| 1     | #50 (merged) | CI on PRs into `feat/demo`                                                                                                                     | —                                  | —   |
| 2     | #48          | Invented seed data and a deterministic invoice generator (`tools/src/demo`). `tools` gains a dependency on `@erp/shared` (shared: both review) | high (shared lockfile), low impact | 25  |
| 3     | #49          | The demo script (docs). It overlaps Farhan's F7 task, so he may take it over                                                                   | low                                | 10  |

Both are up to date with `feat/demo` and have green PR checks.

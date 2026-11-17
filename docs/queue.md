# Work queue: interview-ready slice (due 29 Nov 2026)

Sample data only. One task per session, one `feat/*` branch and one PR per task (under about 400 changed lines).
A task marked "needs" is blocked until that work is merged. Each session updates this file and writes
`docs/notes/<task>.md`.

Status: `todo`, `in progress`, `in review`, `done`, `blocked`. Last matched to the PR list on 17 Nov 2026.

## Munif

| Task | What                                                                                                                                                               | Needs           | Status      | Branch / PR                                                                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1   | Request wrapper for tenant routes; Controllers return `{status, body}`; RLS policy functions; pool and timeout settings                                            | ADR 0005 merged | in progress | see M1 parts below                                                                                                                                   |
| M2   | Organization, legal entity, business, branch with RLS (branch-scoped tables filter on `app_branch_ids()` too); create, list, switch the active business and branch | M1              | in progress | frontend: see frontend parts below                                                                                                                   |
| M3   | Login with argon2id, session, three seeded roles (Owner, Manager, Cashier), permission check middleware                                                            |                 | in progress | frontend: see frontend parts below                                                                                                                   |
| M4   | Journal engine: accounts, journals, lines, balanced-entry trigger, posted entries cannot be edited                                                                 |                 | todo        |                                                                                                                                                      |
| M5   | Tenant-isolation test for every tenant route                                                                                                                       |                 | todo        |                                                                                                                                                      |
| M6   | Read-only owner dashboard: total dues, collections today, per business                                                                                             |                 | in progress | see frontend parts below                                                                                                                             |
| M7   | Public demo deploy and architecture diagram                                                                                                                        |                 | in progress | hosting plan and Docker image: `feat/demo-deploy`, [#17](https://github.com/munifmubtashim/SaaS-ERP-CRM/pull/17); nothing deployed yet; diagram todo |

### M1 parts

| Part   | What                                                                                                                                     | Needs                                                          | Status    | Branch / PR                                                                                                                                                                                               |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a     | Tenant scope runner, `BaseQuery` reads the scoped transaction, nested scopes forbidden                                                   | #3 merged; then update onto #5 and drop its fixed `TX_OPTIONS` | done      | `feat/tenant-scope`, [#4](https://github.com/munifmubtashim/SaaS-ERP-CRM/pull/4) (merged 17 Nov)                                                                                                          |
| 1a-fix | Tenant timeout test matches the timeout error, not any error (Farhan's note on #4)                                                       | #4 merged                                                      | in review | `feat/tenant-timeout-test`, [#18](https://github.com/munifmubtashim/SaaS-ERP-CRM/pull/18)                                                                                                                 |
| 1b-i   | `DB_POOL_MAX`, `DB_TX_TIMEOUT_MS`; `erp_app` role timeouts                                                                               | none (off `main`)                                              | done      | `feat/db-timeouts`, [#5](https://github.com/munifmubtashim/SaaS-ERP-CRM/pull/5) (merged 17 Nov)                                                                                                           |
| 1b-ii  | Route wrapper; Controllers return `{status, body}`; several businesses only on routes marked `{ readOnly: true }`, which run `READ ONLY` | #3 and #4 merged (both done)                                   | in review | `feat/tenant-wrapper`, [#8](https://github.com/munifmubtashim/SaaS-ERP-CRM/pull/8) (draft); module stubs `feat/tenant-wrapper-stubs`, [#9](https://github.com/munifmubtashim/SaaS-ERP-CRM/pull/9) (draft) |
| 1b-iii | RLS policy functions `app_organization_id()`, `app_business_ids()`, `app_branch_ids()` (migration); scope sets `app.branch_ids`          | #3 merged (done); merge main first, tell Farhan                | todo      |                                                                                                                                                                                                           |

### Frontend parts (mock services until the backend exists)

| Part | What                                                                                     | Needs    | Status    | Branch / PR                                                                                         |
| ---- | ---------------------------------------------------------------------------------------- | -------- | --------- | --------------------------------------------------------------------------------------------------- |
| A    | Shared Zod schemas for login, business scope and the owner dashboard; `formatDateTimeBD` | none     | in review | `feat/org-auth-ui-schemas`, [#10](https://github.com/munifmubtashim/SaaS-ERP-CRM/pull/10)           |
| B    | Login screen, session guard, sign-out (M3 frontend)                                      | A merged | in review | `feat/org-auth-ui-login`, [#11](https://github.com/munifmubtashim/SaaS-ERP-CRM/pull/11) (draft)     |
| C    | Business and branch switcher in the header (M2 frontend)                                 | A merged | in review | `feat/org-auth-ui-switcher`, [#12](https://github.com/munifmubtashim/SaaS-ERP-CRM/pull/12) (draft)  |
| D    | Owner dashboard (M6 frontend)                                                            | A merged | in review | `feat/org-auth-ui-dashboard`, [#13](https://github.com/munifmubtashim/SaaS-ERP-CRM/pull/13) (draft) |

B, C and D each branch from A, so whichever merges later has small conflicts in `services/index.ts` and
`test/fakeServices.ts` (and `AppShell.tsx` between B and C): keep both sides.

### Decisions (ADRs)

| ADR  | What                                                  | Status    | Branch / PR                                                                                                                                                  |
| ---- | ----------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0005 | Every tenant request runs in one database transaction | done      | `feat/tenancy-adr`, [#3](https://github.com/munifmubtashim/SaaS-ERP-CRM/pull/3) (merged 17 Nov)                                                              |
| 0006 | Party module plan (customers and suppliers)           | done      | `feat/party-plan-adr`, [#15](https://github.com/munifmubtashim/SaaS-ERP-CRM/pull/15) (merged 17 Nov)                                                         |
| -    | Mark 0005 and 0006 Accepted                           | in review | `feat/adr-0005-accepted`, [#14](https://github.com/munifmubtashim/SaaS-ERP-CRM/pull/14)                                                                      |
| 0007 | The active business and branch come from each request | in review | `feat/adr-0007-active-business`, [#16](https://github.com/munifmubtashim/SaaS-ERP-CRM/pull/16); Farhan's review answered; C (#12) already follows it per tab |

## Farhan

| Task | What                                                                                                           | Needs            | Status      | Branch / PR                                                                                                                   |
| ---- | -------------------------------------------------------------------------------------------------------------- | ---------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| F1   | Customers screens (list, profile) against mock data. F1a: shared Party schema and cursor pagination            |                  | in progress | F1a `feat/party-shared-schema`, [#7](https://github.com/munifmubtashim/SaaS-ERP-CRM/pull/7) (merged 17 Nov); F1b screens todo |
| F2   | Customers on real tables: create, edit, search, duplicate-phone warning                                        | M2 merged        | todo        |                                                                                                                               |
| F3   | Dues and payments: a due per customer, record a payment, customer ledger, Idempotency-Key on the payment route | M3 and F2 merged | todo        |                                                                                                                               |
| F4   | Sample data script: two businesses, synthetic customers and dues                                               | M2 and F2 merged | todo        |                                                                                                                               |
| F5   | Payments post a balanced journal entry                                                                         | M4 and F3 merged | todo        |                                                                                                                               |
| F6   | Daily closing: expected vs counted cash, variance reason, lock the day                                         |                  | todo        |                                                                                                                               |
| F7   | README, screenshots and a five-minute demo walkthrough                                                         |                  | todo        |                                                                                                                               |

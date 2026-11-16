# Work queue: interview-ready slice (due 29 Nov 2026)

Sample data only. One task per session, one `feat/*` branch and one PR per task (under about 400 changed lines).
A task marked "needs" is blocked until that work is merged. Each session updates this file and writes
`docs/notes/<task>.md`.

Status: `todo`, `in progress`, `in review`, `done`, `blocked`.

## Munif

| Task | What                                                                                                                    | Needs           | Status      | Branch / PR        |
| ---- | ----------------------------------------------------------------------------------------------------------------------- | --------------- | ----------- | ------------------ |
| M1   | Request wrapper for tenant routes; Controllers return `{status, body}`; RLS policy functions; pool and timeout settings | ADR 0005 merged | in progress | see M1 parts below |
| M2   | Organization, legal entity, business, branch with RLS; create, list, switch business                                    | M1              | todo        |                    |
| M3   | Login with argon2id, session, three seeded roles (Owner, Manager, Cashier), permission check middleware                 |                 | todo        |                    |
| M4   | Journal engine: accounts, journals, lines, balanced-entry trigger, posted entries cannot be edited                      |                 | todo        |                    |
| M5   | Tenant-isolation test for every tenant route                                                                            |                 | todo        |                    |
| M6   | Read-only owner dashboard: total dues, collections today, per business                                                  |                 | todo        |                    |
| M7   | Public demo deploy and architecture diagram                                                                             |                 | todo        |                    |

### M1 parts

| Part   | What                                                                                   | Needs                                                          | Status    | Branch / PR                                                                              |
| ------ | -------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------- |
| 1a     | Tenant scope runner, `BaseQuery` reads the scoped transaction, nested scopes forbidden | #3 merged; then update onto #5 and drop its fixed `TX_OPTIONS` | in review | `feat/tenant-scope`, [#4](https://github.com/munifmubtashim/SaaS-ERP-CRM/pull/4) (draft) |
| 1b-i   | `DB_POOL_MAX`, `DB_TX_TIMEOUT_MS`; `erp_app` role timeouts                             | none (off `main`)                                              | in review | `feat/db-timeouts`, [#5](https://github.com/munifmubtashim/SaaS-ERP-CRM/pull/5)          |
| 1b-ii  | Route wrapper; Controllers return `{status, body}`                                     | #3 merged                                                      | blocked   |                                                                                          |
| 1b-iii | RLS policy functions `app_organization_id()`, `app_business_ids()` (migration)         | #3 merged; merge main first, tell Farhan                       | blocked   |                                                                                          |

## Farhan

| Task | What                                                                                                           | Needs     | Status | Branch / PR |
| ---- | -------------------------------------------------------------------------------------------------------------- | --------- | ------ | ----------- |
| F1   | Customers screens (list, profile) against mock data                                                            |           | todo   |             |
| F2   | Customers on real tables: create, edit, search, duplicate-phone warning                                        | M2 merged | todo   |             |
| F3   | Dues and payments: a due per customer, record a payment, customer ledger, Idempotency-Key on the payment route | M3 merged | todo   |             |
| F4   | Sample data script: two businesses, synthetic customers and dues                                               |           | todo   |             |
| F5   | Payments post a balanced journal entry                                                                         | M4 merged | todo   |             |
| F6   | Daily closing: expected vs counted cash, variance reason, lock the day                                         |           | todo   |             |
| F7   | README, screenshots and a five-minute demo walkthrough                                                         |           | todo   |             |

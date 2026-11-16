# Interview slice queue (target 29 Nov 2026)

Sample data only. One task per session, one `feat/*` branch, one PR to `main` (under ~400 changed lines).
Status: `todo` · `in progress` · `in review` · `done` · `blocked`.

## Munif

| Task | What                                                                                                                    | Needs           | Status | Branch | PR  |
| ---- | ----------------------------------------------------------------------------------------------------------------------- | --------------- | ------ | ------ | --- |
| M1   | Request wrapper for tenant routes; Controllers return `{status, body}`; RLS policy functions; pool and timeout settings | ADR 0005 merged | todo   |        |     |
| M2   | Organization, legal entity, business, branch with RLS; create, list, switch business                                    |                 | todo   |        |     |
| M3   | Login with argon2id, session, three seeded roles (Owner, Manager, Cashier), permission check middleware                 |                 | todo   |        |     |
| M4   | Journal engine: accounts, journals, lines, balanced-entry trigger, posted entries cannot be edited                      |                 | todo   |        |     |
| M5   | Tenant-isolation test for every tenant route                                                                            |                 | todo   |        |     |
| M6   | Read-only owner dashboard: total dues, collections today, per business                                                  |                 | todo   |        |     |
| M7   | Public demo deploy and architecture diagram                                                                             |                 | todo   |        |     |

## Farhan

| Task | What                                                                                                                        | Needs             | Status      | Branch                         | PR                  |
| ---- | --------------------------------------------------------------------------------------------------------------------------- | ----------------- | ----------- | ------------------------------ | ------------------- |
| F1   | Customers screens (list, profile) against mock data. F1a shared schema (draft PR), then F1b screens after Munif reviews F1a | F1b: F1a reviewed | in progress | F1a `feat/party-shared-schema` | F1a: not opened yet |
| F2   | Customers on real tables: create, edit, search, duplicate-phone warning                                                     | M2 merged         | todo        |                                |                     |
| F3   | Dues and payments: a due per customer, record a payment, customer ledger, Idempotency-Key on the payment route              | M3 merged         | todo        |                                |                     |
| F4   | Sample data script: two businesses, synthetic customers and dues                                                            |                   | todo        |                                |                     |
| F5   | Payments post a balanced journal entry                                                                                      | M4 merged         | todo        |                                |                     |
| F6   | Daily closing: expected vs counted cash, variance reason, lock the day                                                      |                   | todo        |                                |                     |
| F7   | README, screenshots and a five-minute demo walkthrough                                                                      |                   | todo        |                                |                     |

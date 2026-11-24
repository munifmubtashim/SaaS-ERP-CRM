# 0058: Building the demo seed (F6)

| Field               | Value                                                                       |
| ------------------- | --------------------------------------------------------------------------- |
| Status              | Proposed                                                                    |
| Date                | 2026-11-25                                                                  |
| Deciders            | Farhan (owner), Munif (wrote the spec; reviews)                             |
| Spec / roadmap refs | `docs/demo-seed-spec.md` (#188); invariants 1, 3, 4, 7, 8; ADR 0055 to 0057 |

## Context

`docs/demo-seed-spec.md` (Munif, 23 and 24 Nov) says what the local demo database holds. On the payments stack
(#211) the guard `runDemoSeed` and `seedDemoOrganization` exist, but they make one organization ("Demo Group"), one
business, one branch and one owner login. The spec's step 1 also needs a second branch, both branches' series, the
staff directory and four more logins. The chart, the catalogue, the opening stock and journals, and the sales are
not built yet. `createManagers` always uses `SystemClock`, so every sale would be dated today.

## Decision

### 1. Three stacked draft PRs (the spec's "one seed PR", split for review)

| PR  | Branch                 | Spec steps | Contents                                                                                                                                                               |
| --- | ---------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | `feat/demo-seed-base`  | 1, 2       | this ADR; Sample Motor Group, Sample Motors, Showroom and Service centre, their series, staff, the five logins; the chart with the 12 roles and Opening balance equity |
| S2  | `feat/demo-seed-stock` | 3, 4, 5    | parts, bike models, the registration-fee product; opening stock and chassis units; one opening journal per branch                                                      |
| S3  | `feat/demo-seed-sales` | 6, 7       | 20 customers; 25 sales and their payments through the Managers; the spec's section 7 tests                                                                             |

S1 stacks on #211, S2 on S1, S3 on S2. The data is written fresh to the spec's section 2; Munif's #48 is not used.

### 2. One guard, two connections

`runDemoSeed` keeps its checks (no `NODE_ENV=production`; only `localhost`, `127.0.0.1`, `[::1]`) and applies them to
**both** URLs it now takes:

- the migration owner (`MIGRATION_DATABASE_URL`), for the rows only the owner writes: organization tree, series,
  roles, staff, logins, chart, catalogue, serial and vehicle units, the opening journals; through the owner's
  forced-RLS policies, each transaction setting its `app.*` values first;
- the app (`DATABASE_URL`), through `createManagers`, for everything that goes through a real path: stock moves
  (`IStockService.move`, kind `opening`), customers (`PartyManager.create`), sales (`SalesManager.postInvoice`) and
  later payments (`SalesManager.recordPayment`), each inside `tenantScope.run` for the demo business and branch.

No step opens its own connection.

### 3. Dates: an optional clock in `createManagers`

`createManagers` takes an optional `clock` (default `SystemClock`; the api never passes one). The seed passes a
stepping clock, so each sale and payment gets its own business date over the last weeks, and its journal follows.
No period lock exists yet (A17), so nothing refuses the dates; once it does, the seed dates only into open periods.

### 4. A second run writes nothing

- Fixed invented ids and `INSERT … ON CONFLICT DO NOTHING` for every owner-written row.
- The Manager-driven steps can't use fixed ids (the Managers make them), so each runs only while its result is
  missing: the stock step only while the demo business has no `opening_stock` journal (S2 writes those last), the
  customer step only while no customer has the first demo phone, and the sales step only while the demo business has
  no invoice. A finished seed is never repeated.
- A run that fails part-way is fixed by rebuilding the local database; the seed doesn't try to resume.

### 5. Logins and secrets

- The owner signs in with `DEMO_OWNER_EMAIL` and `DEMO_OWNER_PASSWORD`. The four others share `DEMO_USERS_PASSWORD`.
- Their emails are invented on the reserved `.invalid` domain (`manager@sample-motors.invalid`, …).
- All three values come from the environment, are validated like the login form, are hashed, and are never logged,
  printed or put in an error.

### 6. The opening journal (spec section 4a)

One per branch, written as the owner after that branch's opening stock: Dr `inventory`, Cr Opening balance equity,
for on hand × the branch's average cost over counted products plus each unit's own cost; `source_type =
'opening_stock'`, numbered from the branch's `journal` series, dated the seed's opening day. The database still
checks it: balanced at commit, permanent.

### 7. Tests (the spec's section 7, in S3; each part's own in S1 and S2)

A second run writes nothing; the guard refuses production and a non-local host for either URL; every role resolves;
the trial balance balances and every sale and payment has its journal; `stock_balance` equals the sum of movements;
each opening journal balances and the ledger's inventory equals the stock side, after the opening and after the
sales; each customer's ledger due equals their open invoices' dues; no seeded value matches the real-data audit.

## Consequences

- **Easier:** the demo runs on books and stock that agree, through the same code a real business uses.
- **Harder:** the seed depends on the payment route (#211) and the party routes (#209); it can't merge before them.
- **Undo:** the seed is local only; rebuilding the local database removes it.

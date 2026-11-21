# 0024: Plan for C17, the customer credit limit and credit holds

| Field               | Value                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| Status              | Proposed                                                                                               |
| Date                | 2026-11-21                                                                                             |
| Deciders            | Farhan (owner), Munif                                                                                  |
| Spec / roadmap refs | spec S-12, S-15; CLAUDE.md invariants 1, 6; ADR 0006, 0008, 0012, 0016, 0019, 0022; plan C17, 1.5, 2.6 |

## Context

Moto Mart wants an **optional credit limit, no limit by default**, in release 1 (plan 1.5; ADR 0006 order of
work, step 9). Plan row C17: "no limit set = no check; a credit sale over the limit is blocked or waits for
approval (`credit_over_limit`); balance read from the ledger". ADR 0006 also plans `credit_hold`, which blocks
credit sales (S-12).

What already exists or is planned:

- `party.credit_limit` (`numeric(18,2)`, null = no limit) and `party.pay_term_days` come with the `party` table
  in A11 (ADR 0019, #54). `partyDetailSchema` (#47) shows both, and `onCreditHold` (always `false` until this).
- ADR 0006 section 8: `party.credit.edit` changes the credit limit and pay terms, and sets or releases a hold.
- ADR 0022 (#60): `SalesManager.postInvoice` posts a sale; payments at the sale run ADR 0016's path. What stays
  unpaid is the customer's receivable.

This plan touches permissions, a tenant table and a migration, so CLAUDE.md requires it before code. No code is
in this PR.

## Decision

### 1. What counts as credit, and what the limit measures

- **A credit sale** is an invoice whose payments at the sale (ADR 0022 step 7) are below its total. A sale paid
  in full is never checked.
- **Exposure** is the customer's receivable balance **from the ledger** (invariant 1): the sum of debits minus
  credits on `receivable` lines with this `party_id`, less any `customer_advance` the customer holds. After the
  sale, exposure is that balance plus the unpaid part of this invoice.
- The balance comes from Accounting through a small read interface, `IPartyLedger.balances(partyId)` returning
  `{ receivable, customerAdvance }` as money strings (ADR 0012 pattern, provided by Accounting). Open question 1.

### 2. The rule, inside the sale's transaction

In `SalesManager.postInvoice`, after the totals are checked (ADR 0022 step 1) and before any number, stock or
posting call:

1. If the sale is paid in full, skip the check.
2. **Lock the customer:** `SELECT id FROM party WHERE id = $1 FOR UPDATE` through `IPartyCreditLock.lock(partyId)`
   (Party provides it). Two credit sales to one customer at once then run one after the other, so both can't
   pass a check that only one should (invariant 6). The walk-in party is never sold on credit (ADR 0006).
3. **On hold:** an open `credit_hold` refuses the sale with `409 CONFLICT`, field code `credit.on_hold`.
4. **No limit set** (`credit_limit` is null): no further check.
5. **Over the limit:** if exposure after the sale is above `credit_limit`, the sale is refused with
   `409 CONFLICT`, field code `credit.over_limit`, and the response names the limit and the exposure.
   In release 1 this is a hard block; once approvals are built (B7 and B8, planned in ADR 0030, [#68](https://github.com/munifmubtashim/SaaS-ERP-CRM/pull/68), with
   `credit_over_limit` among its release-1 kinds) it can wait for a `credit_over_limit` approval instead (open
   question 2).

Money is compared only with `shared/src/utils/money.ts` (`compareMoney`, `addMoney`).

### 3. Credit holds (`credit_hold`, Party, `party.prisma`, migration `credit_hold`)

| Column        | Notes                                                          |
| ------------- | -------------------------------------------------------------- |
| `id`          | `uuid_v7()`                                                    |
| `business_id` | RLS; composite foreign key `(business_id, party_id)` → `party` |
| `party_id`    | the customer                                                   |
| `reason`      | text, 1 to 500 characters                                      |
| `set_by`      | the caller; `set_at` `timestamptz`                             |
| `released_by` | null until released; `released_at` the same                    |
| `created_at`  | and `updated_at`, `version`; `created_by` = `set_by`           |

- **At most one open hold per customer:** partial unique index `(business_id, party_id) WHERE released_at IS NULL`.
- **Never deleted.** A trigger allows one change only: setting `released_by` and `released_at` on an open hold.
- **RLS and grants** follow ADR 0008 (#27) for every tenant table: forced; `erp_app` policies `TO erp_app` with a
  `FOR` clause per command (`SELECT`, `INSERT`, `UPDATE`), `UPDATE` only on `released_by`, `released_at`,
  `version`, `updated_at`; owner policies `TO CURRENT_USER` for `SELECT`, `INSERT` and `UPDATE`; no `DELETE` for
  any role; a `BEFORE TRUNCATE` trigger. Business-wide, like `party`: no branch condition.
- `PartyDTO` fills `onCreditHold` from the open hold, so the profile badge (#51) becomes real.

### 4. Routes (all `scope: 'tenant'`, each with an isolation case)

| Route                               | Permission            | What it does                                                   |
| ----------------------------------- | --------------------- | -------------------------------------------------------------- |
| `PUT /v1/parties/:id/credit-terms`  | `party.credit.edit`   | sets `creditLimit` (or null) and `payTermDays`, with `version` |
| `POST /v1/parties/:id/credit-holds` | `party.credit.edit`   | opens a hold with a reason; `409` if one is already open       |
| `POST /v1/credit-holds/:id/release` | `party.credit.edit`   | releases it                                                    |
| `GET /v1/parties/:id/credit-holds`  | `party.customer.view` | the hold history, newest first                                 |

The credit limit is never in `PATCH /v1/parties/:id` (ADR 0019's update payload has no `creditLimit`), so changing it needs `party.credit.edit` and nothing else
(open question 4). Each change writes an activity record row when the activity record exists (plan 2.2).

### 5. Pay terms and overdue

`pay_term_days` (null = the business default) sets when an unpaid invoice is overdue. In release 1 the sale
screen **warns** when the customer has an overdue invoice; it doesn't block. Blocking or approval on overdue
(`overdue_credit_sale`, plan 2.6) waits for approvals (open question 3).

## Tests to write first (run to see them fail)

businessLogic, with fakes for `IPartyLedger` and `IPartyCreditLock`:

1. No limit set: a credit sale of any size passes; a sale paid in full is never checked.
2. Limit ৳50,000.00, balance ৳40,000.00: a credit sale leaving ৳10,000.00 unpaid passes; ৳10,000.01 is refused
   with `credit.over_limit`, and no number, stock or posting call is made.
3. A customer advance of ৳5,000.00 lowers the exposure by that amount.
4. An open hold refuses any credit sale (`credit.on_hold`) and allows a sale paid in full.
5. The walk-in party is never sold on credit.

Real Postgres:

6. Two parallel credit sales to one customer whose limit fits only one: exactly one invoice is posted; the
   other gets `credit.over_limit` and leaves nothing behind.
7. A second open hold for the same customer is refused by the partial unique index; after a release, a new hold
   is allowed.
8. A release changes only `released_by` and `released_at`; any other change to a hold raises from the trigger.
   As the owner (no superuser, no `BYPASSRLS`), a `DELETE` removes 0 rows and the rows remain; `TRUNCATE` is
   refused.
9. A hold or credit-terms change for another business's party gets 404 (isolation, one case per route).
10. A user without `party.credit.edit` gets 403 on the three write routes; a cashier can still see the badge.
11. Tests check only their own fresh ids, never table-wide counts (ADR 0008).

## Migration steps (written here, applied in the PR, not now)

1. Merge `main`; tell Munif `credit_hold` is in flight.
2. Add `CreditHold` to `party.prisma` with the composite relation to `Party`.
3. `npm run db:migrate:new -- credit_hold`; append the RLS, the owner policies, the partial unique index, the
   release trigger and the `TRUNCATE` trigger; read every statement.
4. `npm run db:migrate:check`, `db:migrate:deploy` on a throwaway Postgres, `test:integration`, `test:isolation`.

## Size and PR split

| Part | Branch                   | Contents                                                                     | Size (approx.) | Needs first                    |
| ---- | ------------------------ | ---------------------------------------------------------------------------- | -------------- | ------------------------------ |
| 1    | `feat/credit-schemas`    | shared payloads (credit terms, hold), error field codes (both review)        | ~150           | this ADR                       |
| 2    | `feat/credit-holds`      | migration, `PartyQuery` hold methods, `IPartyCreditLock`, routes, tests 7–11 | ~350           | part 1, A11 part 3 and 4 (#54) |
| 3    | `feat/credit-check-sale` | the check in `postInvoice`, `IPartyLedger` use, tests 1–6                    | ~250           | part 2, ADR 0022 part 3, Q1    |

## Blocked by

- A11 (`party`, ADR 0019, #54), with `credit_limit` and `pay_term_days`.
- ADR 0022 (#60): the sale this check runs inside.
- `IPartyLedger` from Accounting (open question 1), on ADR 0013's journal lines (#39).
- Approvals (plan B7, B8) only for the "wait for approval" mode.

## Consequences

- **Easier:** a limit is one field; no limit means no code path runs.
- **Harder:** every credit sale locks its customer row for the length of the sale transaction. Two credit
  sales to the same customer queue; sales to different customers don't.
- **Keep true:** exposure always comes from the ledger, never from a stored balance; a hold is never deleted.
- **Undo:** before go-live, drop `credit_hold` in a new migration and remove the check.

## Open questions for Munif

1. **`IPartyLedger.balances(partyId)`:** will Accounting provide it (receivable and customer advance for one
   party, from journal lines), and does A15's dues route (ADR 0026) use the same read? Recommended: yes, one
   interface for both.
2. **Over the limit in release 1:** hard block now, approval later? Recommended: block, with the error naming
   the limit and the exposure, until B8 (ADR 0030, [#68](https://github.com/munifmubtashim/SaaS-ERP-CRM/pull/68)) is built.
3. **Overdue invoices:** warn only in release 1? Recommended: warn; block or approval with B8 (ADR 0030, `overdue_credit_sale`).
4. **Route shape:** ADR 0006 section 9 lists the hold routes but not `credit-terms`. Is a separate
   `PUT /v1/parties/:id/credit-terms` with `party.credit.edit` acceptable, so `PATCH` never needs two codes?

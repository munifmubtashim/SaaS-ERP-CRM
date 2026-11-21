# 0026: Plan for A15, customer dues and the payment routes

| Field               | Value                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| Status              | Proposed                                                                                                   |
| Date                | 2026-11-21                                                                                                 |
| Deciders            | Farhan (owner), Munif                                                                                      |
| Spec / roadmap refs | spec S-03, S-04, A-06, A-21, B-02, CR-04; invariants 1, 2, 4, 5, 6; ADR 0007, 0011, 0012, 0015, 0016, 0022 |

## Context

Plan row A15 (F3): "dues and record a payment with Idempotency-Key", after A14a. Its tests: one payment per
key; a branch-scoped write needs `X-Branch-Id`; several partial payments on one due, each with its own system
receipt number; Bank, bKash and Card refused without an external transaction id; Cash accepted without one.

ADR 0016 (#43, A16) plans the **posting** of a payment and asks A15 for the `sales_payment` columns it needs
(section 4), with `journal_id` `NOT NULL`. ADR 0022 (#60) posts payments at the sale through the same path.
The shared shapes already exist on #47: `recordPaymentSchema`, `salesPaymentSchema`, `customerDuesSchema`.
The payment screen is on #53, on a mock.

This plan adds a tenant table, routes and a migration on money, so CLAUDE.md requires it before code. No code is
in this PR.

## Decision

### 1. The table (`sales_payment`, Sales, `sales.prisma`, migration `sales_payment`)

The columns ADR 0016 section 4 asks for, and nothing that can be computed:

| Column              | Notes                                                                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                | `uuid_v7()`, taken before the journal posts (ADR 0016 section 1)                                                                              |
| `business_id`       | RLS                                                                                                                                           |
| `branch_id`         | from `X-Branch-Id` (ADR 0007); composite foreign key → `branch`                                                                               |
| `receipt_number`    | `INumberSeries.next('receipt', branchId)` (ADR 0015); unique per business                                                                     |
| `party_id`          | composite foreign key → `party`; never the walk-in party for an advance                                                                       |
| `invoice_id`        | nullable, null for an advance (B-02); composite foreign key → `invoice` (ADR 0022)                                                            |
| `method`            | `cash`, `bank`, `bkash`, `card` (`CHECK`)                                                                                                     |
| `external_ref`      | required for every method but cash (`CHECK`); up to 64 characters                                                                             |
| `amount`            | `numeric(18,2)`, `CHECK (amount > 0)`                                                                                                         |
| `received_at`       | `timestamptz`, set by the server (`receivedAt` in #47); the journal date is the business date in Asia/Dhaka (B15 helper); no date in the body |
| `status`            | `posted` or `voided`                                                                                                                          |
| `journal_id`        | **`NOT NULL`**, composite foreign key → `journal` (invariant 4; ADR 0016 question 1)                                                          |
| `voided_journal_id` | `void_reason`, `voided_by`, `voided_at`: null until voided (ADR 0016 section 5)                                                               |
| `note`              | up to 500 characters                                                                                                                          |
| `created_at`        | `updated_at`, `created_by` (the caller), `version`                                                                                            |

- **One transaction id once per method:** a partial unique index on `(business_id, method, external_ref)`,
  where `external_ref IS NOT NULL AND status = 'posted'`, so the same bKash transaction can't be entered twice
  (#47 question 4). Only posted payments count: a payment voided for a wrong amount leaves the index, so it can
  be entered again with its real transaction id (ADR 0016: voided and entered again). Open question 2.
- **Posted is permanent:** a trigger allows one change only, `posted → voided` with the four void columns.
- **RLS and grants** as every tenant table (ADR 0008, #27): forced, branch-scoped, with `branch_is_active` in
  `WITH CHECK`; `erp_app` `TO erp_app` for `SELECT`, `INSERT` and `UPDATE`, `UPDATE` only on the void columns,
  `status`, `version`, `updated_at`; owner policies `TO CURRENT_USER` for `SELECT`, `INSERT`, `UPDATE`; no
  `DELETE` for any role; a `BEFORE TRUNCATE` trigger.

### 2. Recording a payment: `POST /v1/payments`

`{ idempotent: true }` (ADR 0011) and `X-Branch-Id`. Body: `recordPaymentSchema` (#47). Permission
`sales.payment.create`. The steps are ADR 0016's, in the request's one transaction:

1. Validate: amount above zero as a money string; external id when the method needs it; the party is active and
   not the walk-in party (for an advance); the invoice, if given, is `posted`, belongs to that party, and is in
   the same business. **One exception, still open:** for a bank-loan plan (ADR 0027,
   [#65](https://github.com/munifmubtashim/SaaS-ERP-CRM/pull/65)), the plan's bank may pay on the customer's
   financed invoice, so its payment isn't taken as an advance. That waits for #65's question 5.
2. **Not more than the invoice's due** (#53 question 1): the invoice row is locked with `SELECT … FOR UPDATE`, its
   due is total minus its posted payments, and an amount above it is refused with `409 CONFLICT`,
   `payment.above_due`. The rest can be paid as an advance with a second payment. Open question 3.
3. Receipt number (ADR 0015), payment id, journal (ADR 0016 section 2), insert with `journal_id`.
4. The answer is `salesPaymentSchema`. A repeat with the same key returns it (ADR 0011).

### 3. Reading dues: `GET /v1/parties/:id/dues`

Answer: `customerDuesSchema` (#47). Permission `party.customer.view`.

- **`totalDue` and `advance` come from the ledger** (invariant 1), through `IPartyLedger.balances(partyId)`, the
  same read ADR 0024 uses (its question 1).
- **`openInvoices` come from the documents:** each posted invoice of the party with total above its posted
  payments, with `paid` and `due`, oldest first.
- **They must agree:** with only sales and payments posted, the sum of `due` equals `totalDue`. A test checks
  it. If a manual journal moves a customer's receivable, the ledger total wins and the list shows what the
  documents explain. Open question 4.

### 4. Other routes

| Route                          | Permission           | Notes                                                        |
| ------------------------------ | -------------------- | ------------------------------------------------------------ |
| `GET /v1/parties/:id/payments` | `sales.payment.view` | cursor list, newest first (`salesPaymentListResponseSchema`) |
| `GET /v1/payments/:id`         | `sales.payment.view` | one payment, for the receipt                                 |
| `POST /v1/payments/:id/void`   | `sales.payment.void` | ADR 0016 section 5; `{ idempotent: true }`                   |

New permission codes, added to `permissions.ts` (#26) with their default roles in this PR's part 1:
`sales.payment.create` (Owner, Business Manager, Branch Manager, Accountant, Cashier), `sales.payment.view`
(all five), `sales.payment.void` (Owner, Business Manager, Accountant). Provisional, like every mapping.

### 5. Where A15 ends and A16 begins

The table, the dues read, the list and read routes, and the route wiring for `POST /v1/payments` are A15.
The method rules and the posting step are A16 (ADR 0016). Because `journal_id` is `NOT NULL`, the
`POST /v1/payments` route can only merge together with A16's posting. So A15's part 3 and A16's part 1 are one PR.
Open question 1.

## Tests to write first (run to see them fail)

Real Postgres, through the routes:

1. The same `Idempotency-Key` twice gives one payment, one journal, one receipt number; the second answer
   replays the first.
2. Without `X-Branch-Id`, the payment route answers 400; with a branch outside the caller's scope, 403.
3. Three partial payments on one invoice get three consecutive receipt numbers, and the invoice's due falls
   each time; a fourth above the remaining due gets `payment.above_due` and writes nothing.
4. Bank, bKash and Card without an external id are refused (`CHECK` and schema); Cash is accepted without one.
5. The same bKash transaction id twice in one business is refused; in another business it's accepted. After
   the first payment is voided, the same id is accepted on a new payment; two posted payments with it are
   still refused.
6. An advance (no invoice) posts to `customer_advance`, never revenue (invariant 8); the dues show it.
7. Dues: with sales and payments only, the sum of open invoice dues equals the ledger's receivable for the party.
8. A posted payment refuses every change but a void; a void posts the mirror journal and keeps the receipt
   number used. As the owner (no superuser, no `BYPASSRLS`), a `DELETE` removes 0 rows; `TRUNCATE` is refused.
9. Isolation: business Y gets 404 for X's payment, party dues and invoice by id, on every route; a
   branch-2-only cashier can't post to branch 1.
10. Two parallel payments on the last ৳1,000.00 of one invoice: one is accepted, the other gets
    `payment.above_due` (the row lock, invariant 6).
11. Tests check only their own fresh ids, never table-wide counts.

## Migration steps (written here, applied in the PR, not now)

1. Merge `main`; tell Munif `sales_payment` is in flight (after `sales_invoice`, ADR 0022, and `accounting_core`).
2. Add `SalesPayment` to `sales.prisma`; back-relations on `Branch`, `Party`, `Invoice` and `Journal` (one line
   each, reviewed by each file's owner).
3. `npm run db:migrate:new -- sales_payment`; append the RLS, owner policies, the partial unique index, the
   `CHECK`s, the void trigger and the `TRUNCATE` trigger; read every statement.
4. `npm run db:migrate:check`, `db:migrate:deploy` on a throwaway Postgres, `test:integration`, `test:isolation`.

## Size and PR split

| Part | Branch                     | Contents                                                                       | Size (approx.) | Needs first                          |
| ---- | -------------------------- | ------------------------------------------------------------------------------ | -------------- | ------------------------------------ |
| 1    | `feat/payment-codes`       | permission codes and defaults; `payment.above_due` field code (both)           | ~120           | this ADR, #26                        |
| 2    | `feat/sales-payment-table` | migration, `PaymentQuery`, dues read, list and read routes, tests 5, 7, 9, 11  | ~400           | ADR 0022 part 2, A11, `IPartyLedger` |
| 3    | `feat/payment-posting`     | `POST /v1/payments` and void, with A16's posting (one PR), tests 1–4, 6, 8, 10 | ~400           | part 2, ADR 0016, A14 part 2, A14a   |
| 4    | (on #53)                   | the payment screen switches from the mock to `SalesService`                    | ~100           | part 3                               |

## Blocked by

- ADR 0022 (#60) part 2 (`invoice`), ADR 0016 (#43), ADR 0015 (#41), ADR 0011 and 0014 (#37, #40), ADR 0013 (#39).
- A11 (`party`, #54); A3b part 1 (#31); the business-date helper (B15).
- `IPartyLedger` (ADR 0024 question 1).

## Consequences

- **Easier:** the dues screen and the payment screen (#51, #53) run on real data with no shape change.
- **Harder:** every payment on an invoice locks that invoice row for its transaction; payments on one invoice
  queue, others don't.
- **Keep true:** no payment without its journal; dues totals from the ledger; a receipt number is never reused.
- **Undo:** before go-live, drop `sales_payment` in a new migration and remove the routes.

## Open questions for Munif

1. **A15 part 3 and A16 part 1 as one PR**, because `journal_id` is `NOT NULL`? Recommended: yes, with Farhan as
   author and Munif reviewing the posting.
2. **Transaction id unique per business and method** (#47 question 4)? Recommended: yes, as the partial index.
3. **Paying more than the due** (#53 question 1): refuse, and take the rest as a separate advance? Recommended:
   refuse in release 1.
4. **Dues when the ledger and documents differ** (a manual journal on a customer's receivable): show the
   ledger total with the document list, and flag the difference? Recommended: yes.
5. **A payment at one branch for another branch's invoice** (same business): allowed, receipt numbered at the
   branch that took the money? Recommended: yes.

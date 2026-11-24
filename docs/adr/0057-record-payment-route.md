# 0057: POST /v1/payments, recording a customer payment (F3)

| Field               | Value                                                                     |
| ------------------- | ------------------------------------------------------------------------- |
| Status              | Proposed                                                                  |
| Date                | 2026-11-25                                                                |
| Deciders            | Farhan (owner), Munif (reviews the posting and the shared part)           |
| Spec / roadmap refs | spec S-03, S-04, B-02; invariants 1, 4, 5, 6, 8; ADR 0011, 0016, 0026; F3 |

## Context

ADR 0026 section 2 plans `POST /v1/payments`. On the backend tip (#195) most of it already exists:

- the `sales_payment` table with every column ADR 0026 lists (migration `sales_payment`), so **no migration**;
- `SalesPaymentRecorder` (ADR 0016): the method rules, the external id, the journal (cash, bank, bKash or card
  against `receivable`, or `customer_advance` without an invoice), and the refusal above the invoice's due with the
  invoice row locked `FOR UPDATE` (`409 payment.exceeds_due`);
- `IdempotencyGuard` (ADR 0011): the same key and body replays the first answer; the same key with another body is
  `409 idempotency.key_reused`;
- the shapes `recordPaymentSchema`, `salesPaymentSchema` and `paymentStatusSchema` on #47.

## Decision

### 1. Two backend PRs now, the screens after

| PR  | Branch                  | Contents                                                                                 |
| --- | ----------------------- | ---------------------------------------------------------------------------------------- |
| P1  | `feat/payment-contract` | this ADR; #47's branch merged in; `sales.payment.create` with its defaults and seed text |
| P2  | `feat/payment-route`    | `SalesManager.recordPayment`, `POST /v1/payments`, isolation cases, ADR 0026 tests       |
| P3  | later                   | the frontend service and switch; screens stay on marked sample until invoice reads exist |

P1 stacks on #209, P2 on P1.

### 2. The permission (P1)

`sales.payment.create`: Owner, Business Manager, Branch Manager, Accountant, Cashier (ADR 0026 section 4).
`sales.payment.view` and `sales.payment.void` come with the read and void routes.

### 3. The route (P2)

`POST /v1/payments`, `{ idempotent: true }`, permission `sales.payment.create`, `X-Branch-Id` required (the branch
that takes the money, ADR 0026 question 5). Body `recordPaymentSchema`. Steps, in the request's one transaction:

1. The party is visible, active and a customer; an advance (no invoice) may not name the walk-in party.
2. The receipt number: `INumberSeries.next('receipt', branchId)` (ADR 0015 order: the document's number first).
3. `SalesPaymentRecorder.record`: the invoice due check with the row lock, the journal, the insert with
   `journal_id` (invariant 4). The note and the creator are stored with the row.
4. `201` with `salesPaymentSchema`. A repeat with the same key replays it.

### 4. The 409s

- The same `Idempotency-Key` with another body: `409 idempotency.key_reused` (the guard).
- A new key whose amount is above the invoice's remaining due, a fully paid invoice included:
  `409 payment.exceeds_due`, nothing written, no number used.
- Several partial payments on one invoice, each with its own key, are allowed (ADR 0026 test 3).

### 5. Tests to write first (P2, real Postgres through the route)

ADR 0026 tests 1 (replay: one payment, one journal, one receipt), 2 (no `X-Branch-Id` 400; a branch outside the
scope refused), 3 (three partials, consecutive receipts; a fourth above the due refused), 4 (bank, bKash, card
without an external id 400; cash without one 201), 6 (an advance posts to `customer_advance`, never revenue),
9 (business Y gets 404 for X's party and invoice), 10 (two parallel payments on the last due: one wins), and the
key reused with another body (409). Tests check only their own fresh ids.

## Consequences

- **Easier:** the seed (F6) records its payments through the real route's Manager.
- **Harder:** the payment screens can't use real invoices until the invoice reads exist (F4 and after).
- **Undo:** remove the route; the table and the recorder stay as they are.

# 0016: Plan for A16, customer payments post a balanced journal

| Field               | Value                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| Status              | Proposed                                                                                         |
| Date                | 2026-11-21                                                                                       |
| Deciders            | Munif, Farhan                                                                                    |
| Owner               | **Farhan** (plan row A16, queue task F5; Sales module)                                           |
| Spec / roadmap refs | CLAUDE.md invariants 1, 4, 5, 8; spec S-03, A-06, A-19, B-02; ADR 0012, 0013, 0015; plan 1.5 (4) |

## Context

A payment from a customer must change the books in the same transaction that records it (invariant 4). If
posting fails, the payment must not exist either.

**Moto Mart decisions (plan 1.5, answer 4):**

- Methods are Cash, Bank, bKash and Card, all entered by hand.
- Every payment has a system receipt number.
- Bank, bKash and Card also need the external transaction id.
- Bike sales are paid in several partial payments.

**This plan covers the posting part only.** The payment tables, the route and dues are A15 (Farhan). This plan
assumes A15 creates a `sales_payment` table with the columns listed in section 4, and asks for one of them
(`journal_id`). A15 has no ADR yet; if its design differs, this plan follows it.

It touches the ledger, so CLAUDE.md requires an agreed plan first. No code is in this PR.

## Decision

### 1. The order inside the one request transaction

The Sales Manager's `recordPayment` (A15) does these steps, in this order, in the request transaction
(ADR 0005). The route carries `{ idempotent: true }` (ADR 0011).

1. Validate the input (shared Zod schema): amount above zero, method, external id when the method needs it.
2. Take the receipt number: `INumberSeries.next('receipt', branchId)` (ADR 0015).
3. Get the new payment's id from the database (`uuid_v7()`), so the journal can name its source before the
   payment row exists.
4. Post the journal: `IPostingService.post(draft)` (ADR 0012) with `source = { type: 'sales_payment', id }`.
5. Insert the payment row with the returned `journal_id`. The column is **not null**, so a payment can't
   exist without its journal.
6. Write the outbox event when the outbox exists (invariant 10; deferred with the worker).

Posting before the insert means no `UPDATE` on payments is ever needed to attach the journal. Any failure in
steps 2 to 5 rolls everything back: no payment, no journal, no number used (ADR 0015 gives the number back on
rollback).

### 2. The journal for each payment

| Payment is for                    | Debit (by method, section 3) | Credit                           |
| --------------------------------- | ---------------------------- | -------------------------------- |
| An invoice's due (A-06)           | method's role                | `receivable`, with `party_id`    |
| An advance, no invoice yet (B-02) | method's role                | `customer_advance` (a liability) |

Two lines, equal amounts. An advance is **never** revenue (invariant 8). When the invoice is raised later, the
advance is applied by its own journal (Dr `customer_advance`, Cr `receivable`). That's part of the invoice
work (C-phase), not A16.

### 3. Payment methods as classes (CLAUDE.md open/closed)

```ts
interface IPaymentMethodRule {
  readonly method: 'cash' | 'bank' | 'bkash' | 'card';
  readonly debitRole: AccountRole; // cash, bank, mobile_money, card_clearing
  readonly needsExternalRef: boolean; // false only for cash
}
```

- **One class per method** (`CashPayment`, `BankPayment`, `BkashPayment`, `CardPayment`), registered in
  `createManagers`. A new method (for example Nagad) is a new class, not a new `switch` branch.
- **The rule decides the debit role and the external-id requirement.** The Manager never names an account.

### 4. What A16 asks of A15's table

`sales_payment` (A15) needs these columns for posting:

- `journal_id`: not null, with a composite foreign key `(journal_id, business_id)` to `journal`;
- `receipt_number`: unique per business;
- `method`, `external_ref` and `amount`;
- `branch_id`;
- `party_id`;
- `invoice_id`: nullable, null for an advance;
- `status`: `posted` or `voided`.

If A15 merges without `journal_id`, A16 adds it with a migration. That's open question 1.

### 5. Voiding a payment

A wrong payment is voided, never deleted (invariant 2; A-11):

1. `IPostingService.reverse(journalId, reason)` posts the mirror journal.
2. The payment's `status` changes from `posted` to `voided`, with `voided_journal_id`, `void_reason` and
   `voided_by`.

A trigger allows only that one change on a payment row. The receipt number stays used.

## Tests to write first (run to see them fail)

**businessLogic, with `FakePostingService` and `FakeNumberSeries` (ADR 0012):**

1. Each method posts Dr its role, Cr `receivable` (with the party) for the same amount.
2. An advance posts Cr `customer_advance`, never an income role.
3. Bank, bKash and Card without an external id are refused before anything is posted; Cash is accepted
   without one.
4. If posting throws, no payment insert is attempted.

**Real Postgres, through the route:**

5. A payment and its journal commit together; the journal balances and its amount equals the payment's.
6. Posting fails (unmapped role, or a closed day from ADR 0017) → no payment row, no journal, and the next
   payment gets the receipt number the failed one would have had.
7. The same `Idempotency-Key` twice → one payment, one journal, one receipt number.
8. Two parallel payments in one branch → two consecutive receipt numbers, two journals.
9. Void → the reversal journal mirrors the original, the payment is `voided`, and the original journal is
   untouched; voiding twice is refused.
10. Isolation: business Y can't see or void X's payment by id (an isolation case for every new route).

## Migration

**None in A16** if A15 includes the columns in section 4 (recommended). Otherwise
`sales_payment_journal`, written and reviewed before it is applied:

1. merge `main`;
2. `npm run db:migrate:new -- sales_payment_journal`;
3. add the column, the composite foreign key and the void trigger;
4. `db:migrate:check`, `test:integration`, `test:isolation`.

## Size and PR split

| Part | Branch                 | Contents                                            | Size (approx.) | Needs first                       |
| ---- | ---------------------- | --------------------------------------------------- | -------------- | --------------------------------- |
| 1    | `feat/payment-posting` | method rules, posting in `recordPayment`, tests 1–8 | ~350           | A13 part 2, A14a, A14, A15 merged |
| 2    | `feat/payment-void`    | void route, reversal, trigger, tests 9–10           | ~250           | part 1                            |

## Blocked by

- **ADR 0012** (#38), for `IPostingService` and the role names.
- **A13** (ADR 0013, #39) parts 1 and 2: journals and `PostingService`.
- **A14a** (ADR 0015, #41): receipt numbers.
- **A14** (ADR 0014, #40): idempotent routes.
- **A15** (Farhan): the payment table and route. Not planned yet.
- **The business-date helper** ("today in Asia/Dhaka", plan B15, Farhan) for the journal date.

## Consequences

- **Easier:** dues and the dashboard can read the ledger, and they will agree with the payments, because both
  come from one transaction.
- **Harder:** a payment can't be "fixed"; it's voided and entered again, by design.
- **Keep true:** no payment without a journal; advances are liabilities.
- **Undo:** before go-live, revert the code; the posting is behind one Manager method.

## Open questions for Farhan (owner)

1. Will A15's `sales_payment` include `journal_id` (not null) and the void columns from the start, so A16 needs
   no migration? Recommended: yes.
2. Partial payments on one invoice: one journal per payment (this plan), agreed?
3. Card payments: post to `card_clearing` and settle to `bank` later by a manual journal, or straight to
   `bank`? Recommended: clearing, so the bank statement can be matched later (A-15).
4. Should voiding need an approval (plan B7), or is the Owner or Accountant role enough for release 1?

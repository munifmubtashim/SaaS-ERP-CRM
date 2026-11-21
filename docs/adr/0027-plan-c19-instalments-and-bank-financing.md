# 0027: Plan for C19 and C20, instalments and bank financing

| Field               | Value                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| Status              | Proposed                                                                                                   |
| Date                | 2026-11-21                                                                                                 |
| Deciders            | Farhan (owner), Munif                                                                                      |
| Spec / roadmap refs | spec S-14, S-03, S-04, CR-12; invariants 1, 2, 4, 5; ADR 0012, 0016, 0022, 0024, 0025, 0026; plan C19, C20 |

## Context

Moto Mart sells bikes on **instalments or a bank loan**, in release 1 (plan 1.5). The plan lists C19 as an ADR
first, and C20 as the build: "instalments sum exactly to the financed balance (A8 `allocate`); each instalment
payment posts through `IPostingService`; Idempotency-Key".

What this builds on:

- The sale is a normal posted invoice (ADR 0022, #60). What stays unpaid is the customer's receivable.
- Payments go through A15 and A16 (ADR 0026, ADR 0016): one receipt number and one journal each.
- `allocate` (A8, merged in #22) splits an amount into parts that sum exactly.
- The guarantor is a `party_relation` (ADR 0025); the credit limit and holds are ADR 0024.

This plan adds tenant tables, journals and a migration, so CLAUDE.md requires it before code. No code is in this PR.

## Decision

### 1. Two kinds of financing, one plan table

- **Instalments (in-house):** the customer pays the business in parts, on a calendar.
- **Bank loan:** a bank pays the business the financed amount; the customer repays the bank. For the business,
  the customer's receivable moves to the bank.

Both start from a posted invoice with a balance: `financed_amount = invoice total − payments at the sale`.

### 2. Tables (Sales, `sales.prisma`, migration `instalment_plan`)

**`instalment_plan`:**

| Column               | Notes                                                                               |
| -------------------- | ----------------------------------------------------------------------------------- |
| `id`, `business_id`  | `uuid_v7()`; RLS                                                                    |
| `branch_id`          | the invoice's branch; branch-scoped RLS                                             |
| `invoice_id`         | composite foreign key → `invoice`; **one active plan per invoice** (partial unique) |
| `party_id`           | the customer; composite foreign key → `party`                                       |
| `guarantor_party_id` | nullable; composite foreign key → `party` (ADR 0025 question 2)                     |
| `kind`               | `instalment` or `bank_loan`                                                         |
| `financed_amount`    | `numeric(18,2)`, above zero                                                         |
| `instalment_count`   | 1 to 60 (`instalment` only)                                                         |
| `first_due_on`       | date; monthly after that (`instalment` only)                                        |
| `bank_party_id`      | `bank_loan` only; the bank as a party (open question 2)                             |
| `bank_reference`     | `bank_loan` only; the loan or file number, up to 64 characters                      |
| `status`             | `active`, `completed`, `cancelled`                                                  |
| `journal_id`         | `bank_loan` only: the transfer journal (section 4)                                  |
| `created_at`         | `updated_at`, `created_by`, `version`                                               |

**`instalment`** (append-only):

| Column    | Notes                                                            |
| --------- | ---------------------------------------------------------------- |
| `plan_id` | composite foreign key → `instalment_plan`; `seq` unique per plan |
| `due_on`  | date                                                             |
| `amount`  | `numeric(18,2)`, above zero                                      |

- **The schedule is fixed:** `allocate(financed_amount, count equal weights)` gives the amounts, so they always
  sum to `financed_amount` (৳1,00,000.00 in 3 is ৳33,333.34, ৳33,333.33, ৳33,333.33). A `CHECK`-style trigger at
  commit checks the sum.
- **Nothing is edited.** A changed plan is a new plan: the old one becomes `cancelled`, a new one starts from the
  remaining balance (open question 3). A trigger allows only `active → completed` and `active → cancelled`.
- **RLS and grants** as every tenant table (ADR 0008, #27): forced, branch-scoped with `branch_is_active`;
  `erp_app` `TO erp_app`, `UPDATE` only on `status`, `version`, `updated_at`; owner policies `TO CURRENT_USER`
  (`instalment` is append-only: `SELECT` and `INSERT` only); no `DELETE` for any role; `BEFORE TRUNCATE` triggers.

### 3. Paying instalments

- A payment against a financed invoice is a normal A15 payment on that invoice (ADR 0026): one receipt, one
  journal, `Idempotency-Key`.
- **Which instalment it pays is computed, not stored:** payments on the invoice are applied to instalments in
  `seq` order. An instalment is paid, part paid or overdue by that rule. No payment row is changed.
- The plan becomes `completed` when the invoice's due reaches zero, in the same transaction as the last payment.

### 4. Bank loan: the receivable moves to the bank

When the bank approves the loan (`POST /v1/instalment-plans` with `kind: 'bank_loan'`), one journal through
`IPostingService`:

| Line     | Debit                                         | Credit                                            |
| -------- | --------------------------------------------- | ------------------------------------------------- |
| Transfer | `receivable` = financed, `partyId` = the bank | `receivable` = financed, `partyId` = the customer |

When the bank pays, it's a payment from the bank party against its receivable: Dr the method's role, Cr
`receivable` with the bank's `partyId`. The customer's due is then zero, and the bank's falls.

A15 (ADR 0026) checks that a payment's invoice belongs to the paying party. For a `bank_loan` plan it also
accepts the plan's `bank_party_id` as the payer on that invoice, so the bank's payment isn't taken as an advance.
Open question 5.

### 5. Routes (all `scope: 'tenant'`, each with an isolation case)

| Route                                  | Permission               | Notes                                              |
| -------------------------------------- | ------------------------ | -------------------------------------------------- |
| `POST /v1/instalment-plans`            | `sales.financing.create` | `{ idempotent: true }`, `X-Branch-Id`              |
| `GET /v1/invoices/:id/instalment-plan` | `sales.financing.view`   | the plan, its schedule and each instalment's state |
| `POST /v1/instalment-plans/:id/cancel` | `sales.financing.create` | with a reason; a new plan follows                  |
| `GET /v1/instalments/due`              | `sales.financing.view`   | the due calendar, by date, for the Action Center   |

### 6. Interest and fees

None in release 1 (plan Q20: no interest on late payments). If the price on instalments is higher, the higher
price is the invoice total. Interest income over time, and processing fees, need the accountant (open question 1).

## Tests to write first (run to see them fail)

businessLogic, with fakes:

1. ৳1,00,000.00 in 3 gives ৳33,333.34, ৳33,333.33, ৳33,333.33; property test: any amount and count sum exactly.
2. A plan above the invoice's due, on an unposted or voided invoice, or with a second active plan is refused.
3. Payments apply to instalments in order: ৳40,000.00 pays the first and ৳6,666.66 of the second.
4. The bank-loan journal has two lines, equal amounts, the bank's and the customer's `partyId`.

Real Postgres:

5. The schedule rows sum to `financed_amount`; a schedule that doesn't is refused at commit.
6. The same `Idempotency-Key` twice gives one plan and one journal.
7. A plan changes only by status; cancelling and replacing keeps the old rows. As the owner (no superuser, no
   `BYPASSRLS`), a `DELETE` removes 0 rows; `TRUNCATE` is refused.
8. The last payment completes the plan in the same transaction.
9. Isolation: business Y gets 404 for X's plan by id; a guarantor or bank from another business fails on the
   composite foreign key.
10. Tests check only their own fresh ids, never table-wide counts.

## Migration steps (written here, applied in the PR, not now)

1. Merge `main`; tell Munif `instalment_plan` is in flight (after `sales_invoice` and `sales_payment`).
2. Add `InstalmentPlan` and `Instalment` to `sales.prisma`; back-relations on `Invoice`, `Party` (three named
   relations), `Branch` and `Journal`, each reviewed by its owner.
3. `npm run db:migrate:new -- instalment_plan`; append RLS, owner policies, the partial unique index, the status
   and sum triggers, the `TRUNCATE` triggers; read every statement.
4. `npm run db:migrate:check`, `db:migrate:deploy` on a throwaway Postgres, `test:integration`, `test:isolation`.

## Size and PR split

| Part | Branch                   | Contents                                                    | Size (approx.) | Needs first                              |
| ---- | ------------------------ | ----------------------------------------------------------- | -------------- | ---------------------------------------- |
| 1    | `feat/financing-schemas` | shared payloads, schedule shape, permission codes (both)    | ~200           | this ADR                                 |
| 2    | `feat/instalment-tables` | migration, Query, Manager for `instalment`, tests 1–3, 5–10 | ~400           | part 1, ADR 0022 part 2, ADR 0026 part 3 |
| 3    | `feat/bank-loan`         | `bank_loan` plans and the transfer journal, test 4          | ~250           | part 2, question 2                       |
| 4    | `feat/financing-screens` | plan on the sale screen, due calendar                       | ~350           | part 2                                   |

## Blocked by

- ADR 0022 (#60), ADR 0026 (A15), ADR 0016 (#43), ADR 0013 (#39), ADR 0025 (C18).
- Open questions 1 and 2 before part 3.

## Consequences

- **Easier:** the due calendar and overdue lists come from fixed schedules and posted payments.
- **Harder:** a change of plan is a cancel and a new plan, never an edit.
- **Keep true:** the schedule always sums to the financed amount; a bank loan never posts revenue.
- **Undo:** before go-live, drop the two tables in a new migration.

## Open questions for Munif (and the owner or accountant where marked)

1. **(Accountant)** Is there interest or a markup on instalments, and is it income at the sale or over time? A
   processing fee? Recommended for release 1: no interest; a higher instalment price is just the invoice total.
2. **A bank as a party:** a party with `is_supplier = true` (it pays us, but it's not a customer), and a
   `receivable` line with its `partyId`? Or a separate `bank_receivable` role? Recommended: `receivable` with the
   bank's `partyId`, so the bank shows in dues like any debtor.
3. **Rescheduling:** cancel and replace, as above? Recommended: yes.
4. **Frequency:** monthly only in release 1? Recommended: yes.
5. **The bank paying on the customer's invoice:** A15 accepts the plan's bank as the payer on a financed invoice
   (section 4)? Recommended: yes, a rule in A15's validation, tested there.

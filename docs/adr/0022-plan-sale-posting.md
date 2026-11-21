# 0022: Plan for posting a sale (invoice, stock movements and a balanced journal in one transaction)

| Field               | Value                                                                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Status              | Proposed                                                                                                                                |
| Date                | 2026-11-21                                                                                                                              |
| Deciders            | Munif, Farhan                                                                                                                           |
| Owner               | **Farhan** (Sales; plan rows C9, C10, and the posting half of C11). Drafted by Munif for the 29 Nov demo path                           |
| Spec / roadmap refs | spec S-03, S-06, A-11, F-02, F-08; CLAUDE.md invariants 1, 2, 4, 5, 6, 7, 8; ADR 0011, 0012, 0013, 0015, 0016, 0020, 0021; plan C9, C10 |

## Context

**Invariant 4:** a source document posts its journal and its stock movements in one transaction, and stores
the journal id. The demo's main step (#49, steps 6 and 7) is exactly that:

- a cashier sells a bike and a helmet;
- the bike leaves stock by its chassis number and the helmet by quantity;
- a balanced journal posts revenue and cost of goods;
- the owner's figures change.

**This ADR plans the sale.** The pieces it uses are planned elsewhere:

| Piece                            | ADR  |
| -------------------------------- | ---- |
| Units and their conditional sell | 0020 |
| Stock movements and costs        | 0021 |
| The journal                      | 0013 |
| Gapless numbers                  | 0015 |
| The contracts between modules    | 0012 |
| `Idempotency-Key`                | 0011 |
| Payments at the sale             | 0016 |

The feature plan reserved this as C9, "sales documents and posting rules", under a number now taken.
CLAUDE.md requires an agreed plan before ledger, stock or migration code. No code is in this PR.

## Decision

### 1. Tables (Sales, `sales.prisma`, migration `sales_invoice`)

The rules from #27 and #31 apply:

- `business_id`, `uuid_v7()` ids, `created_by` (the caller).
- RLS forced, branch-scoped, with `branch_is_active(branch_id)` in `WITH CHECK`.
- `TO` and `FOR` clauses on every policy.
- No `DELETE` for any role; a `BEFORE TRUNCATE` trigger.

**`invoice`:**

| Column                          | Notes                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------ |
| `branch_id`                     | composite foreign key; from `X-Branch-Id` (ADR 0007)                           |
| `number`                        | from `INumberSeries.next('invoice', branchId)` (ADR 0015); unique per business |
| `party_id`                      | composite foreign key to `party`; the walk-in party for walk-ins (ADR 0019)    |
| `invoice_date`                  | date, the business date in Asia/Dhaka                                          |
| `subtotal`, `discount`, `total` | `numeric(18,2)`; `total = subtotal − discount` (`CHECK`), all ≥ 0              |
| `status`                        | `posted` or `voided`; an invoice is posted on insert, so there's no draft row  |
| `journal_id`                    | **`NOT NULL`**, composite foreign key to `journal` (invariant 4)               |
| `sold_by`                       | the caller's user id                                                           |

**`invoice_line`**, append-only:

| Column           | Notes                                                                   |
| ---------------- | ----------------------------------------------------------------------- |
| `invoice_id`     | composite foreign key; `line_no` unique per invoice                     |
| `product_id`     | composite foreign key                                                   |
| `serial_unit_id` | nullable; set for a serial product, and then `qty = 1` (`CHECK`)        |
| `qty`            | `numeric(18,3)`, above zero                                             |
| `unit_price`     | `numeric(18,2)`, copied from the product at sale time (P-07)            |
| `line_total`     | `numeric(18,2)`; `multiplyByQuantity(unit_price, qty)` in businessLogic |
| `cost_amount`    | `numeric(18,2)`, the cost ADR 0021 returned. **A hidden field**         |

**Grants and the posted rule:**

- **`erp_app`:** `SELECT`, `INSERT` on both tables. `UPDATE` only on `invoice.status`, and a trigger allows
  only `posted → voided` (C14 plans the void and its reversal).
- **Owner policies:** `invoice_line` is append-only, so `FOR SELECT` and `FOR INSERT` only. `invoice` adds
  `FOR UPDATE`, held to that one change by the same trigger.
- **A posted invoice refuses every edit, from any login** (Moto Mart's shared-login case, plan 1.5). No grant
  exists for any column but `status`, and the trigger covers the owner and a superuser too.

### 2. The one write path: `SalesManager.postInvoice`, in the request's transaction

The route is `POST /v1/invoices`, with `{ idempotent: true }` (ADR 0011) and `X-Branch-Id`. The steps run in
this order:

1. **Validate** the shared Zod payload. Check money as strings through the shared helpers:
   - `line_total` and `subtotal` by `sumMoney`;
   - `total = subtotal − discount`, and `discount` not above `subtotal`.

   Every product must be `active` (ADR 0020). A serial product needs its `serial_unit_id`.

2. **Take the invoice number** (ADR 0015). If payments follow in the same request, the receipt number is taken
   after it, in the order ADR 0015 fixes (`kind` alphabetical), so two sales can't deadlock.
3. **Move the stock** with one call to `IStockService.move` (ADR 0021):
   - serial units through ADR 0020's conditional sell: `unit.not_available` if already sold;
   - other items through the conditional decrement: `stock.insufficient`.

   Both return the cost used.

4. **Get the new invoice's id** from the database (`uuid_v7()`), so the journal can name its source first
   (the ADR 0016 pattern).
5. **Post one journal** with `IPostingService.post` (ADR 0012, 0013) and `source = { type: 'sales_invoice', id }`:

   | Line          | Debit                    | Credit                        |
   | ------------- | ------------------------ | ----------------------------- |
   | Sale          | `receivable` = `total`   | `sales_revenue` = `total`     |
   | Cost of goods | `cogs` = Σ `cost_amount` | `inventory` = Σ `cost_amount` |
   - The receivable line carries `party_id`, for the customer ledger.
   - Revenue is posted net of discount (open question 1).
   - Pass-through amounts (registration fees, plan Q17) are never sales revenue. Such a line posts to
     `pass_through_payable` (invariant 8), and waits for Q17.

6. **Insert** the invoice with `journal_id`, then its lines.
7. **Payments at the sale** (the demo's cash plus bKash): each runs ADR 0016's path in the same transaction:
   Dr the method's role, Cr `receivable`. One journal per payment (ADR 0016, question 2).
8. **Commit.** The deferred balance trigger checks every journal (ADR 0013).

**Any failure rolls everything back:** the invoice, the movements, the unit's status, the journals, and the
numbers too (ADR 0015 gives them back).

### 3. What isn't in this plan

- **The VAT line:** waits for plan Q15. If the business is VAT registered, the VAT line (S-06) is added through
  A8's `computeVat`, per line (ADR 0001 D1), with an `output_vat` liability role.
- **Not in this ADR:**
  - discount approval (C12, after approvals B7 and B8);
  - returns and voids (C14);
  - held sales and barcode (C13 UI).

## Tests to write first (run to see them fail)

**businessLogic, with the fakes from ADR 0012:**

1. A bike plus a helmet produce two lines, two stock moves and one journal:
   - Dr `receivable` = total, Cr `sales_revenue` = total;
   - Dr `cogs` = the bike's own cost plus the helmet's average × qty, Cr `inventory` the same.
2. An archived product, a serial product without a unit, a discount above the subtotal, and money sent as a
   number are each refused before any call.
3. If the stock move or the posting throws, no invoice insert is attempted.

**Real Postgres, through the route:**

4. The invoice, its lines, the movements, the unit's `sold` status and the journal commit together. The journal
   balances, `invoice.journal_id` points at it, and stock and the balance cache agree.
5. **Two cashiers, one chassis** (F-02):
   - two parallel invoices for the same unit give exactly one invoice;
   - the other gets `409 unit.not_available`, and nothing of it remains, its invoice number included.
6. **Negative stock** (F-08): selling more of a part than is on hand gives `409 stock.insufficient` and writes
   nothing.
7. **The same `Idempotency-Key` twice** gives one invoice, one journal and one set of movements, and the second
   answer replays the first.
8. **A posted invoice refuses every edit:** `erp_app` gets `permission denied` on any column but `status`; as
   the owner it changes 0 rows; a role that bypasses RLS hits the trigger.
9. A sale paid part in cash and part by bKash also posts two payment journals, and the receipt numbers follow
   each other.
10. **Isolation:** business Y can't read or post against X's invoice, products or units by id, and a
    branch-2-only cashier can't post to branch 1 (one isolation case per route).
11. The posting uses only account roles. No account code appears in Sales (lint rule from ADR 0012).

## Migration steps (written here, applied in the PR, not now)

1. Merge `main`; tell Munif `sales_invoice` is in flight (plan section 6, row 13: after `accounting_core` and
   the product and inventory migrations).
2. Add both models to `sales.prisma`; back-relations on `Branch`, `Party`, `Product`, `SerialUnit` and `Journal`
   (one line each, reviewed by each file's owner, plan Q11).
3. `npm run db:migrate:new -- sales_invoice`; append RLS, grants, owner policies, the status, immutability and
   `TRUNCATE` triggers and the `CHECK`s; review the SQL.
4. `npm run db:migrate:check`; `db:migrate:deploy` on a throwaway Postgres; `test:integration`;
   `test:isolation`.

## Size and PR split

| Part | Branch                 | Contents                                              | Size (approx.) | Needs first                                         |
| ---- | ---------------------- | ----------------------------------------------------- | -------------- | --------------------------------------------------- |
| 1    | `feat/invoice-schemas` | shared Zod payload and response (both review)         | ~200           | this ADR                                            |
| 2    | `feat/invoice-tables`  | migration, triggers, RLS, `InvoiceQuery`, tests 8, 10 | ~400           | ADR 0013 part 1, ADR 0020 part 2, A11 part 3        |
| 3    | `feat/invoice-posting` | `SalesManager.postInvoice`, tests 1 to 7, 9, 11       | ~400           | part 2, ADR 0021 part 2, ADR 0013 part 2, A14a, A14 |
| 4    | `feat/pos-live`        | the POS screen on the real route (C13 backend half)   | ~300           | part 3, #8, A6                                      |

## Blocked by

- ADR 0012 (#38), 0013 (#39), 0015 (#41), 0011 and 0014 (#37, #40), 0016 (#43): all still Proposed.
- ADR 0020 and 0021 (new, Proposed).
- A11 (`party`, ADR 0019, #54).
- A3b part 1 (#31), #29, #8 and A6.

## Consequences

- **Easier:**
  - the dashboard's revenue, cost of goods and cash come from real journals;
  - the stock screen comes from real movements;
  - one failed step can never leave half a sale.
- **Harder:**
  - a sale touches four modules' services in one transaction, so the slow review covers all four;
  - a mistake can only be voided and re-entered, by design.
- **Keep true:** no invoice without its journal; revenue never includes pass-through money; every number comes
  from ADR 0015.
- **Undo:** before go-live, revert the code and drop the tables in a new migration.

## Open questions (Farhan first)

1. **Discount:** post revenue net of discount (this draft), or gross revenue plus a `discount_allowed` expense
   line? Recommended: net, unless the accountant wants discounts visible in the books.
2. **Payments at the sale:** do they always go through ADR 0016's payment path (recommended), or can an invoice
   carry an "amount paid" with no payment rows?
3. **A named customer for a serial unit** (ADR 0020, question 3): required for a bike sale?
4. **Delivery:** the unit goes to `sold` at the sale and `delivered` later (F-06). Is "sold, not delivered" in
   the demo, or does the demo deliver at once?
5. **Registration fee lines** (plan Q17): until the owner answers, should the POS refuse a pass-through line?
   Recommended: yes, so nothing is wrongly posted as revenue.

# 0028: Plan for D1, purchase documents (order, receipt, supplier bill, payment, return)

| Field               | Value                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| Status              | Proposed                                                                                                        |
| Date                | 2026-11-21                                                                                                      |
| Deciders            | Farhan (owner), Munif                                                                                           |
| Spec / roadmap refs | spec PU-01 to PU-12, I-01, A-02, A-05, A-21, A-22, F-03; invariants 1–7; ADR 0012, 0015, 0016, 0020, 0021, 0022 |

## Context

The plan lists D1, "purchase documents", as an ADR first, and D2 to D6 as the builds: orders with statuses and
approval, goods receipts (partial, serial units, payable), supplier bills with a three-way match, supplier
payments and advances, purchase returns, direct purchase and reorder to a draft order. **Supplier payables are
release 1** (plan 1.5); landed cost (F-10) is phase 2.

The feature plan reserved 0019 for this; that number went to A11 (ADR 0019), so this is 0028. Stock comes in
through ADR 0021's `IStockService.move` with a receipt cost; bike units through ADR 0020; journals through
`IPostingService` (ADR 0012); numbers through ADR 0015.

This plan touches stock, the ledger, tenant tables and migrations, so CLAUDE.md requires it before code. No code
is in this PR.

## Decision

### 1. Documents and what each one posts

| Document                  | Number kind (ADR 0015, per branch) | Stock (ADR 0021)              | Journal (`IPostingService`)                                                          |
| ------------------------- | ---------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------ |
| Purchase order (PU-01)    | `purchase_order`                   | none                          | none                                                                                 |
| Goods receipt (PU-02, 03) | `goods_receipt`                    | `receipt` in, at the PO price | Dr `inventory`, Cr `goods_received_not_invoiced`                                     |
| Supplier bill (PU-04)     | `supplier_bill`                    | none                          | Dr `goods_received_not_invoiced` (+ `input_vat` if registered), Cr `payable` (party) |
| Supplier payment (PU-05)  | `supplier_payment`                 | none                          | Dr `payable` (party) or `supplier_advance`, Cr the method's role                     |
| Purchase return (PU-07)   | `purchase_return`                  | `purchase_return` out         | Dr `payable` (party), Cr `inventory`; see section 3, open questions 7 and 8          |
| Direct purchase (PU-12)   | receipt + bill numbers             | as the receipt                | as the receipt and the bill, in one transaction                                      |

- **Account roles, not codes** (ADR 0012). New roles: `goods_received_not_invoiced`, `payable`,
  `supplier_advance`, `input_vat`, `purchase_price_variance` (open question 1).
- **Each posting document posts in one transaction** and stores its `journal_id` `NOT NULL` (invariant 4).
- **The supplier is a party** with `is_supplier` (ADR 0006); `party.supplier.*` codes apply to the supplier itself.

### 2. Tables (Purchase, `purchase.prisma`)

All business-owned, branch-scoped, with the rules from #27 and #31: `uuid_v7()` ids, `created_by` the caller,
RLS forced with `branch_is_active` in `WITH CHECK`, `TO` and `FOR` on every policy, owner policies
`TO CURRENT_USER` (append-only tables: `SELECT` and `INSERT` only), no `DELETE` for any role, a
`BEFORE TRUNCATE` trigger on each.

| Table                  | Key columns                                                                                                     | Editable?                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `purchase_order`       | `number`, `party_id`, `status`, `expected_on`, `total`, `approved_by`, `approved_at`, `version`                 | lines only while `draft`   |
| `purchase_order_line`  | `product_id`, `qty`, `unit_price`, `line_total`                                                                 | while the order is `draft` |
| `goods_receipt`        | `number`, `purchase_order_id` (nullable), `party_id`, `received_on`, `status`, `journal_id`                     | never (void only)          |
| `goods_receipt_line`   | `product_id`, `purchase_order_line_id`, `qty`, `unit_cost`, `serial_unit_id`                                    | append-only                |
| `supplier_bill`        | `number`, `supplier_bill_no` (the supplier's own), `party_id`, `bill_date`, `due_on`, `total`, `journal_id`     | never (void only)          |
| `supplier_bill_line`   | `goods_receipt_line_id`, `qty`, `unit_price`, `line_total`                                                      | append-only                |
| `supplier_payment`     | `number`, `party_id`, `supplier_bill_id` (nullable = advance), `method`, `external_ref`, `amount`, `journal_id` | never (void only)          |
| `purchase_return`      | `number`, `goods_receipt_id`, `party_id`, `reason`, `journal_id`                                                | never (void only)          |
| `purchase_return_line` | `goods_receipt_line_id`, `qty`, `unit_cost`, `serial_unit_id`                                                   | append-only                |

- **Order statuses:** `draft → submitted → approved → partly_received → received → closed`, and `cancelled` from
  `draft`, `submitted` or `approved`. A trigger allows only these changes.
- **Money** is `numeric(18,2)`, quantities `numeric(18,3)`; line totals with `multiplyByQuantity` in businessLogic.
- **Unique per business:** each `number`; `(party_id, supplier_bill_no)` so one supplier bill isn't entered twice.

### 3. Rules that keep the money and stock true

- **Receipt cost** is the order line's price, or the typed cost for a direct purchase. It's the `unit_cost` of the
  movement; ADR 0021 updates the branch's weighted average (invariant 7).
- **Serial units (PU-03):** each bike received creates its `serial_unit` row through Inventory's
  `IUnitReceipt.receive(...)` (ADR 0020, open question 2) with its own cost, in the same transaction. Chassis and
  engine numbers come from the Vehicle pack; the core sees only `serial_no`.
- **Over-receipt:** receiving more than ordered is refused (`purchase.over_receipt`), with a per-business
  tolerance of 0 by default (open question 3).
- **Three-way match (PU-04):** a bill line points at a receipt line; billed quantity can't exceed received
  quantity minus what's already billed. A price above the order line posts the difference to
  `purchase_price_variance`, never back into stock cost (open question 4).
- **Supplier payment:** the same method rules as sales payments (ADR 0016's `IPaymentMethodRule`), external id
  required for every method but cash. Paying more than the bill's due is refused; the rest is an advance.
- **Return:** goes out through `IStockService.move` with a negative quantity, as a new movement kind
  `purchase_return` (ADR 0021 adds later kinds with their features); it can't take stock below zero
  (F-08), and a serial unit must still be `in_stock`.
- **Two known problems with the return's journal** (Munif's rules to decide; not decided here):
  - **Returning goods not yet billed.** "Dr `payable`" assumes the supplier has billed them. If not, nothing is
    owed yet, and the debit leaves a false balance on the supplier. Proposed fix: debit
    `goods_received_not_invoiced` for the unbilled quantity and `payable` only for the billed quantity. Open
    question 7.
  - **Stock value and journal amount can differ.** For non-serial products, ADR 0021 values stock going out at the
    branch's weighted average, while the return line's `unit_cost` is the receipt cost. Crediting `inventory` at
    the receipt cost would let the account drift from the stock valuation. Proposed fix: credit `inventory` with
    the cost `IStockService.move` returns, and post any difference to the supplier's refund to
    `purchase_price_variance`. Open question 8.
- **Applying a supplier advance to a later bill** isn't planned yet: a payment with no bill posts to
  `supplier_advance`, but nothing sets it against a bill. Sales has the same gap for customer advances, which
  ADR 0016 leaves to the invoice work. Open question 9.
- **Payables aging (PU-06, A-21):** from the ledger's `payable` lines per supplier (invariant 1), with the bills
  for the breakdown, as ADR 0026 does for dues.
- **Approval (PU-08):** an order over a per-business amount waits for approval once approvals exist (plan 2.6,
  B7 and B8). In release 1, approving needs `purchase.order.approve` and can't be done by the order's creator
  (open question 5).

### 4. Routes (all `scope: 'tenant'`, each with an isolation case)

Every money or stock POST carries `{ idempotent: true }` (ADR 0011) and `X-Branch-Id`. New permission codes:
`purchase.order.create`, `purchase.order.approve`, `purchase.receipt.create`, `purchase.bill.create`,
`purchase.payment.create`, `purchase.return.create`, `purchase.document.view`, `purchase.document.void`.

Default roles, added to `permissions.ts` (#26) in part 1, provisional like every mapping (as #64 and #65 do):

| Code                      | Owner | Business Manager | Branch Manager | Accountant | Cashier |
| ------------------------- | ----- | ---------------- | -------------- | ---------- | ------- |
| `purchase.order.create`   | yes   | yes              | yes            | yes        | no      |
| `purchase.order.approve`  | yes   | yes              | no             | no         | no      |
| `purchase.receipt.create` | yes   | yes              | yes            | no         | no      |
| `purchase.bill.create`    | yes   | yes              | no             | yes        | no      |
| `purchase.payment.create` | yes   | yes              | no             | yes        | no      |
| `purchase.return.create`  | yes   | yes              | yes            | no         | no      |
| `purchase.document.view`  | yes   | yes              | yes            | yes        | no      |
| `purchase.document.void`  | yes   | yes              | no             | yes        | no      |

`POST /v1/purchase-orders`, `POST /v1/purchase-orders/:id/submit`, `…/approve`, `…/cancel` ·
`POST /v1/goods-receipts` · `POST /v1/supplier-bills` · `POST /v1/supplier-payments` · `POST /v1/purchase-returns` ·
`POST /v1/direct-purchases` · `POST /v1/<document>/:id/void` · `GET` list and read routes for each.

### 5. Not in this plan

Landed cost (F-10, phase 2); reorder suggestion and price history (PU-10, PU-11) are reads over these tables,
planned in their PRs; preorder allocation on receipt (B-07) waits for booking (C15).

## Tests to write first (run to see them fail)

businessLogic, with `FakePostingService`, `FakeStockService` and `FakeNumberSeries`:

1. A receipt of 10 at ৳100.00 posts Dr `inventory` ৳1,000.00, Cr `goods_received_not_invoiced` ৳1,000.00, and
   one receipt movement with `unit_cost` ৳100.00.
2. A bill for that receipt at ৳100.00 posts Dr GRNI, Cr `payable` with the supplier's `partyId`; at ৳105.00 it
   posts the ৳50.00 difference to `purchase_price_variance`.
3. Billing more than received, receiving more than ordered, and paying more than a bill's due are each refused
   before any call.
4. A direct purchase posts the receipt and the bill in one transaction.

Real Postgres:

5. Receipt, movements, units and journal commit together; a failure in any rolls back all, numbers included.
6. Two receipts against the last 5 open on an order line: one succeeds, the other gets `purchase.over_receipt`
   (row lock on the order line, invariant 6).
7. A return can't take stock below zero, and a sold bike can't be returned.
8. The same `Idempotency-Key` twice gives one document and one journal.
9. The same supplier bill number twice for one supplier is refused.
10. Posted documents refuse every edit but a void; as the owner (no superuser, no `BYPASSRLS`), a `DELETE`
    removes 0 rows; `TRUNCATE` is refused.
11. Payables per supplier from the ledger equal the sum of open bills, with bills and payments only.
12. Isolation: business Y gets 404 on X's documents by id; a branch-2-only user can't receive into branch 1.
13. Tests check only their own fresh ids, never table-wide counts.

## Migration steps (written here, applied in each PR, not now)

1. Merge `main`; tell Munif which purchase tables are in flight, one migration per PR below.
2. Add the models to `purchase.prisma`; back-relations on `Branch`, `Party`, `Product`, `SerialUnit` and `Journal`
   (one line each, reviewed by each file's owner).
3. `npm run db:migrate:new -- <name>`; append RLS, owner policies, the status and void triggers, the `TRUNCATE`
   triggers and the `CHECK`s; read every statement.
4. `npm run db:migrate:check`, `db:migrate:deploy` on a throwaway Postgres, `test:integration`, `test:isolation`.

## Size and PR split

| Part | Plan row | Branch                  | Migration          | Contents                                         | Size (approx.) |
| ---- | -------- | ----------------------- | ------------------ | ------------------------------------------------ | -------------- |
| 1    | D2       | `feat/purchase-order`   | `purchase_order`   | orders, statuses, approval by permission         | ~400           |
| 2    | D3       | `feat/goods-receipt`    | `goods_receipt`    | receipts, units, stock and journal; tests 1, 5–8 | ~400           |
| 3    | D4       | `feat/supplier-bill`    | `supplier_bill`    | bills, three-way match; tests 2, 3, 9            | ~400           |
| 4    | D5       | `feat/supplier-payment` | `supplier_payment` | payments, advances, payables aging; test 11      | ~400           |
| 5    | D6       | `feat/purchase-return`  | `purchase_return`  | returns, direct purchase, reorder to draft order | ~400           |

Part 4 can come right after part 3, ahead of the order work, if supplier payables are wanted first for
release 1 (bills entered without an order).

## Blocked by

- ADR 0012 (#38), 0013 (#39), 0015 (#41), 0016 (#43), 0011 and 0014 (#37, #40), 0020 (#58), 0021 (#59).
- A11 (`party`, #54) and A3b part 1 (#31).
- Approvals (B7, B8) only for approval by amount.

## Consequences

- **Easier:** stock and payables come from posted documents and the ledger, never from typed balances.
- **Harder:** six document types, each with its own number series and void path.
- **Keep true:** no posting document without its journal; receipt cost is the only way cost enters stock.
- **Undo:** before go-live, drop each part's tables in a new migration.

## Open questions for Munif

1. **Account roles:** `goods_received_not_invoiced`, `payable`, `supplier_advance`, `input_vat`,
   `purchase_price_variance`. Add them to ADR 0012's role list? Recommended: yes.
2. **Creating serial units on receipt:** an `IUnitReceipt.receive(productId, branchId, serialNo, unitCost, source)`
   from Inventory (ADR 0020)? Recommended: yes, the same pattern as `IUnitSale`.
3. **Over-receipt tolerance:** 0 by default, per business setting later? Recommended: yes.
4. **Bill price above the order:** variance to `purchase_price_variance`, not into stock cost? Recommended: yes
   in release 1; landed cost (phase 2) revisits it.
5. **Order approval before B8:** `purchase.order.approve`, not by the creator? Recommended: yes.
6. **Release 1 order:** supplier payables first (part 4 after part 3, bills without an order)? Recommended: yes.
7. **Returning goods not yet billed** (section 3): debit `goods_received_not_invoiced` for the unbilled
   quantity and `payable` only for the billed quantity? Proposed: yes.
8. **The return's inventory credit** (section 3): the cost `IStockService.move` returns, with the difference to the
   supplier's refund in `purchase_price_variance`? Proposed: yes, so the `inventory` account matches the stock
   valuation.
9. **Applying a supplier advance to a bill:** its own journal (Dr `payable`, Cr `supplier_advance`) when the
   bill is posted or later, like the sales side in ADR 0016? Proposed: plan it with part 4 (D5).

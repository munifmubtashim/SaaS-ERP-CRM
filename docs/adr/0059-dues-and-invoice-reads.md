# 0059: Customer dues and invoice reads (F5, F4), and the walk-in party is not edited

- **Status:** agreed by Farhan (25 Nov 2026); awaiting Munif's review
- **Date:** 2026-11-25
- **Builds on:** ADR 0026 section 3 (dues), ADR 0057 (the payment route), ADR 0055 (walk-in party), ADR 0006 section 6

## Context

The end-to-end walk on 25 Nov (#217, #219) showed the customer profile's dues and the Record payment form can't work
on real customers. Customers are real by default, dues are still sample, and the sample knows only sample ids.
ADR 0026 section 3 already designs the dues read, but #64 (ADR 0026) was never reviewed. This ADR takes only its
section 3 and adds the invoice reads that ADR 0057 left for "F4 and after". It also answers ADR 0026's open
question 4.

## Decision

### 1. F5: `GET /v1/parties/:id/dues` (PR 1)

- Answer: `customerDuesSchema` (#47), unchanged. Permission: `party.customer.view` (exists, #207).
- **`totalDue` and `advance` come from the ledger:** `IPartyLedger.balances(partyId)` (#195). This is invariant 1.
- **`openInvoices` come from the documents:** each posted (not voided) invoice of the party whose total is above
  its recorded payments, with `total`, `paid` and `due` as money strings, oldest first.
- **They agree when only sales and payments are posted:** the sum of `due` equals `totalDue` (ADR 0026 test 7).
  If a manual journal moves the receivable, the ledger total wins and the list shows what the documents explain
  (ADR 0026 open question 4). Release 1 has no flag for the difference.
- A party of another business, or no party, is 404 (ADR 0019 test 15). The walk-in party answers zero dues.
- Layers: `PartyRoutes` → `PartyController.dues` → `PartyManager.dues`, which uses `IPartyLedger` and a new
  `IOpenInvoiceQuery` that `SalesQuery` satisfies. It is a read only: no write, no lock, no migration.

### 2. F4: invoice reads (PR 2)

- `GET /v1/invoices`: a cursor list of the scope's posted invoices, newest first. It filters by `partyId` and
  `branchId`. Shape: `invoiceSummarySchema`, which already exists as a provisional POS shape and becomes the
  contract.
- `GET /v1/invoices/:id`: one invoice with its lines and payments, as `invoiceDetailSchema`.
- New permission `sales.invoice.view`, default for all five roles, in `permissions.ts`. This is shared code, so
  both developers review it.
- No cost or margin in either answer (plan 2.5). 404 for another business's invoice (isolation cases).
- Payment reads (`GET /v1/parties/:id/payments`, `GET /v1/payments/:id`, ADR 0026 section 4) are not in this PR.

### 3. The walk-in party is not edited (PR 1, a separate commit)

- `PartyManager.update` on the walk-in party throws `409 party.walk_in_locked`, the same code as deactivate,
  with the message "The walk-in customer cannot be changed." It is created by the business's trigger (ADR 0055),
  and the POS depends on its name and code.
- The profile hides **Edit** for the walk-in party (#218), as it already hides **Record payment** (#217).

### 4. The screens (PR 3, frontend, stacked on #219)

- `party.dues` becomes real by default: the profile's dues panel and the payment form read `GET .../dues`.
- `sales.payments` becomes real by default: the form pays the real open invoices that F5 lists (ADR 0057 section 1's
  condition). POS › Invoices stays sample; rewiring it to F4 is Munif's screen.

## Tests to write first (run to see them fail)

1. **Dues:** for a fresh customer with two sales (one partly paid) and an advance, the answer's `totalDue` equals
   `IPartyLedger.balances`, the sum of `openInvoices[].due` equals `totalDue`, and the list is oldest first, with the
   paid invoice absent.
2. **Dues isolation:** business Y gets 404 for X's party dues, the same as for a guessed id.
3. **Dues:** the walk-in party answers zero with no open invoices. A cashier (`party.customer.view`) may read dues.
4. **F4:** the list shows only the scope's invoices, filtered by party, newest first. The cursor pages without
   skipping. The detail's lines and payments add up to the total and the paid amount. No `cost` key appears.
5. **F4 isolation:** Y gets 404 for X's invoice by id, and X's invoices never appear in Y's list. A role without
   `sales.invoice.view` gets 403.
6. **Walk-in:** `PATCH` on the walk-in party is 409 `party.walk_in_locked` and the row is unchanged. A named
   customer's edit still works.
7. **Screens:** the dues panel and the form call the API by default. A real 404 or 409 shows the translated message.

## Migration steps

None: reads only, on existing tables. If the open-invoice query needs an index on `invoice (business_id, party_id)`,
that becomes a separate migration PR, and I tell Munif first.

## Consequences

- **Easier:** the demo path's profile and Record payment run on the seeded books.
- **Harder:** `invoiceSummarySchema` stops being provisional, so a change to it needs both of us.
- **Keep true:** the dues total always comes from the ledger, never from summing documents.

# 0040: Plan for stock adjustments and physical counts (C7)

| Field               | Value                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| Status              | Proposed                                                                                             |
| Date                | 2026-11-21                                                                                           |
| Deciders            | Munif, Farhan                                                                                        |
| Owner               | Munif (Inventory; plan row C7)                                                                       |
| Spec / roadmap refs | spec I-04, I-05, I-06; CLAUDE.md invariants 1, 2, 3, 4, 6; ADR 0013, 0021, 0030, 0034; plan 9 "keep" |

## Context

Stock on the shelf and in the books drift apart: damage, loss, miscounts.

- **I-04:** an adjustment needs a reason and an approval.
- **I-05:** a physical count records what's there, and the difference becomes an adjustment.

Plan 9 keeps approvals for adjustments in release 1. The design (`design/owner-dashboard/Inventory.dc.html`) shows
"Adjust stock" with reasons: count correction, damaged, found in store, returned by customer, returned to
supplier.

This is a stock, ledger and migration change, so CLAUDE.md requires an agreed plan. No code is in this PR.

## Decision

### Tables (Inventory, migration `stock_adjustments`)

| Table                   | Notes                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stock_adjustment`      | `branch_id`, `location_id` (ADR 0034), `reason` (the design's list), `memo`, `status` (`pending`, `posted`, `rejected`), `journal_id` when posted |
| `stock_adjustment_line` | `product_id`, `serial_unit_id`, `qty_delta` (± `numeric(18,3)`, never zero)                                                                       |
| `stock_count`           | `branch_id`, `location_id`, `counted_on`, `status` (`open`, `submitted`), the count's lines with `counted_qty`                                    |

The rules on #27 and #31 apply. They're branch-scoped, and the lines are append-only.

### Flow

1. **Adjustment:**
   - Submit, then `IApprovalService.request('stock_adjustment', …)` (ADR 0030). A different user approves.
   - On approval, in one transaction:
     - `IStockService.move` with kind `adjustment` (ADR 0021, refused if it would go negative);
     - `PostingService.post`. A loss is Dr `inventory_loss`, Cr `inventory`; a gain is the reverse, at the
       movement's cost.
     - The adjustment becomes `posted` with `journal_id` (invariant 4).
   - **"Damaged"** moves the units to the branch's `damaged` location (ADR 0034) instead of writing them off. A
     later write-off is a second adjustment.
2. **Count:**
   - Open a count for one location. The system takes a snapshot of on hand at that time.
   - Staff enter counted quantities; submitting creates **one adjustment** with the differences, reason
     `count_correction`, and that adjustment then follows step 1.
   - Stock that moved after the snapshot is handled by comparing against the snapshot, not the live figure.

## Invariants touched

3 (stock only through movements), 1 and 4 (a balanced journal with the movement), 2 (never edited; corrections are
new adjustments), 6 (conditional decrement), and permissions (no self-approval).

## Tests to write first

1. A pending adjustment moves nothing and posts nothing; approval by another user moves stock and posts a balanced
   journal at the movement's cost, once.
2. The creator can't approve (`approval.self`); a rejected adjustment never moves stock.
3. A loss that would take on hand below zero is refused at approval (`stock.insufficient`).
4. "Damaged" moves units to the `damaged` location, which isn't sellable (ADR 0034).
5. A count's submission creates one adjustment with exactly the differences from its snapshot.
6. Serial units: a missing unit becomes an adjustment of −1 with its `serial_unit_id`, at the unit's own cost.
7. Isolation: business Y can't see or approve X's adjustments or counts.

## Dependencies

- ADR 0021 (#59) and ADR 0034 (#73), ADR 0013 (#39), ADR 0030 (#68, Farhan), ADR 0020 (#58), ADR 0011 (#37).

## Size and PR split

| Part | Contents                                                   | Size |
| ---- | ---------------------------------------------------------- | ---- |
| 1    | adjustments: tables, approval, posting, tests 1 to 4, 6, 7 | ~400 |
| 2    | counts: snapshot, entry, submission, test 5                | ~350 |

## Consequences

- **Easier:** shrinkage and damage are in the books, with who approved them.
- **Harder:** every adjustment waits for a second person.
- **Undo:** before go-live, drop the tables in a new migration.

## Open questions (decided)

1. ~~Every adjustment needs approval?~~ **Decided by Munif, 21 Nov:** yes, every adjustment in release 1.
2. ~~One account or per reason?~~ **Decided by Munif, 21 Nov:** one account (`inventory_loss` role) for stock
   losses and gains.
3. ~~Whole branch or one location?~~ **Decided by Munif, 21 Nov:** a count covers one location at a time.

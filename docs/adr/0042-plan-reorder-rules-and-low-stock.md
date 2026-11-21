# 0042: Plan for reorder rules, Low and Out of stock (C8)

| Field               | Value                                                                                              |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| Status              | Proposed                                                                                           |
| Date                | 2026-11-21                                                                                         |
| Deciders            | Munif, Farhan                                                                                      |
| Owner               | Munif (Inventory; plan row C8). Purchase's "draft order from reorder" (D6) is Farhan's             |
| Spec / roadmap refs | spec I-03, PU-10, C-14; CLAUDE.md invariants 3, 10; ADR 0012, 0021, 0032, 0034; plan 2.4, 2.8, 3.2 |

## Context

- **I-03:** each item has a reorder level and a reorder quantity. An item at or below its level shows **Low** and
  raises an alert, and **the basis for Low is visible**.
- **PU-10:** items at or below the level can be turned into a draft purchase order in one step (Farhan, D6).
- Plan 3.2 sets the rules below; this ADR fixes the table, the figures and the alert.

It adds a tenant table and an outbox event, so CLAUDE.md requires an agreed plan. No code is in this PR. It posts
nothing and moves no stock.

## Decision

### Table `reorder_rule` (Inventory, migration `reorder_rules`)

| Column             | Notes                                                                           |
| ------------------ | ------------------------------------------------------------------------------- |
| `branch_id`        | composite key `(business_id, branch_id)`; a rule is per branch (question 1)     |
| `product_id`       | composite key `(business_id, product_id)`; unique per `(branch_id, product_id)` |
| `reorder_level`    | `numeric(18,3)`, ≥ 0                                                            |
| `reorder_qty`      | `numeric(18,3)`, > 0                                                            |
| `is_active`        | boolean; a switched-off rule raises nothing                                     |
| `set_by`, `set_at` | who last changed the rule, and when (shown in the basis)                        |
| `version`          | edited by people, so optimistic locking (`version.stale`)                       |

The rules on #27 and #31 apply (branch-scoped RLS with `branch_is_active(branch_id)`, no `DELETE`, the `TRUNCATE`
trigger). `erp_app` may `UPDATE (reorder_level, reorder_qty, is_active, set_by, set_at, version, updated_at)`
only. Nothing is deleted: a rule is **switched off** with `is_active = false`. Every change writes an activity
event (ADR 0032) with the old and new figures.

### The figures (per branch and product)

- **On hand** = the sum over the branch's sellable locations (`sales_floor` and `storage`, ADR 0034).
  `in_transit`, `damaged` and `quarantine` don't count.
- **Available** = on hand − reserved (ADR 0021).
- **Low** when `0 < available ≤ reorder_level`. **Out of stock** when `available ≤ 0`. Out is listed separately
  and never counted as Low.
- **No rule, or a switched-off rule:** neither Low nor Out is raised (question 2).
- **Suggested order** = `reorder_qty` (question 3).

### The basis on screen (I-03)

`GET /v1/stock/levels?status=low|out` returns, per row, every figure the sentence needs, so the screen never
computes it: `onHand`, `reserved`, `available`, `reorderLevel`, `reorderQty`, `setByName`, `setAt`,
`suggestedQty`, `status`. The screen shows, for example: "Available 3 = on hand 5 − reserved 2. Reorder level 4,
set by Rahim on 12/11/2026. Suggested order: 10." Strings are in `i18n` (en, bn).

### The alert

- **Crossing, not level.** When a stock movement **or a reservation** (both change Available) takes Available from
  **above** the level to **at or below** it, `IStockService` writes one `stock.low` event to the outbox in the
  same transaction (invariant 10), with the branch, product, `available` and `reorder_level`. A crossing straight
  to 0 is the same event; its `available` says it's out.
- Staying below the level writes nothing more; rising above it and crossing again writes a new event.
- The **in-app notification** is made from that event by the notifications design (B11, batch 5), not here.
- **The Action Center list is the derived query above**, so it's right even when no event fired (a level raised
  above the current stock, an import, a missed event).

### `IReorderSource` for Purchase (plan 2.8)

Inventory provides `IReorderSource.suggestions(branchId, productIds?)`, returning `{ productId, available,
reorderLevel, suggestedQty }` for Low and Out rows. Purchase's `POST /v1/purchase-orders/from-reorder` (D6,
Farhan, ADR 0028) reads it and creates a **Draft** order; nothing is approved or sent automatically. The contract
file lives in Purchase's `contracts/` (the consumer owns it, CLAUDE.md).

### Routes and permissions

| Route                                                                    | Permission                                                                  |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `GET /v1/stock/levels`                                                   | `inventory.stock.view`                                                      |
| `GET`, `PUT /v1/reorder-rules/:productId` (branch from the active scope) | `inventory.reorder_rule.manage` for `PUT`, `inventory.stock.view` for `GET` |

Default mapping: Owner, Business Manager and Branch Manager manage rules; every role can view stock levels.

## Invariants touched

3 (figures come from the ledger and the balance cache, never stored separately), 10 (the event is written in the
movement's transaction), tenancy (branch-scoped rule).

## Tests to write first

1. Status: with level 4, Available 5 is fine, 4 and 1 are Low, 0 and −1 (more reserved than on hand) are Out and not Low.
2. Available excludes `in_transit` and `damaged` stock and subtracts reservations.
3. A sale taking Available from 5 to 3 (level 4) writes exactly one `stock.low` event in the same transaction; a
   second sale to 2 writes none; a receipt to 6 and a sale back to 4 writes a new one.
4. A reservation that crosses the level writes the event too; a rolled-back sale writes none.
5. A product with no rule, or a switched-off rule, is neither Low nor Out.
6. The levels endpoint returns every basis field, with `setByName` and `setAt` from the last change.
7. Raising the level above current stock lists the item as Low in the Action Center without any event.
8. Two people editing one rule: the second gets `version.stale`.
9. Isolation: branch 2's rules and levels are invisible to a branch-1-only user, and business Y sees nothing of X.

## Dependencies

- ADR 0021 (#59) and ADR 0034 (#73): balances, reservations, locations.
- The outbox (B11, batch 5) for the event: part 2 waits for it. Part 1 (rules and figures) doesn't.
- ADR 0028 (#66, Farhan) for the Purchase side of PU-10.

## Size and PR split

| Part | Contents                                                          | Size |
| ---- | ----------------------------------------------------------------- | ---- |
| 1    | table, figures, levels endpoint, rules routes; tests 1, 2, 5 to 9 | ~350 |
| 2    | crossing detection and the `stock.low` outbox event; tests 3, 4   | ~200 |
| —    | `IReorderSource` provider (Munif) with D6's draft order (Farhan)  | ~100 |

## Consequences

- **Easier:** the owner sees why an item is Low, and one click starts a purchase order.
- **Harder:** every movement and reservation checks the rule for its product and branch (one indexed read in the
  same transaction).
- **Undo:** before go-live, drop the table; no stock or money data depends on it.

## Open questions (with recommended answers)

1. **Munif:** I-03 says "each item has a reorder level". Per branch, or one per business? **Recommended:** per
   branch (plan 3.2), because each branch orders for its own shelf. A business-wide default copied into new
   branches can come later.
2. **Munif:** a product with no rule: show it as Out when its Available is 0? **Recommended:** no. Many products are
   never stocked in every branch, so Out would flood the list. Only products with an active rule get Low or Out.
3. **Munif:** suggested order: the fixed `reorder_qty`, or "top up to level + quantity"? **Recommended:** the fixed
   `reorder_qty` in release 1, as the spec says; the buyer edits the draft order anyway.

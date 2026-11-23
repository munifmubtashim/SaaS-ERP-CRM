# 0054: Amend ADR 0021: for the 30 Nov demo, stock is per branch, with no In transit and no transfers

| Field               | Value                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------- |
| Status              | Proposed                                                                              |
| Date                | 2026-11-23                                                                            |
| Deciders            | Munif, Farhan                                                                         |
| Amends              | ADR 0021 (#59) sections 1, 1b, 2 and 4; defers ADR 0034 (#73) and ADR 0041 (#83)      |
| Spec / roadmap refs | spec F-01, F-02, F-08, I-08; CLAUDE.md invariants 2, 3, 4, 6, 7; plan rows C1, C3, C6 |

## Context

ADR 0021 (the stock ledger) was amended on 21 Nov twice. Stock is kept **per location** (ADR 0034, #73): a
`location` table, `location_id` on every movement and balance row, and a default `sales_floor` location per branch
for POS sales. A transfer's stock on the road sits in **one In transit location per business** that belongs to no
branch (section 1b, ADR 0041, #83). That brings nullable `branch_id` on movements, a trigger, `NULLS NOT DISTINCT`
keys, a transfer-only RLS rule through `stock_transfer_party_in_scope()`, and a nightly In transit check.

None of it is reviewed. #59, #73 and #83 have no review yet. The 30 Nov demo needs receipts, sales and the
stock-on-hand screen only: no transfers, no showroom/warehouse split. Building locations and In transit now puts
the hardest RLS of the stock plan (branchless rows) on the demo's critical path, for features the demo doesn't
show.

This amendment narrows the first build to **stock per branch**, and keeps everything needed so locations and
transfers can be added later **without rewriting a posted movement** (invariant 2).

## Decision

### 1. For the demo, the stock location is the branch

**Option B: one location per branch (decided by Munif, 23 Nov).** The `location` table from ADR 0034 is built in its smallest
form, and stock is per branch in every rule, screen and API:

- `location` has exactly one row per branch, kind `sales_floor`, `is_default_sale = true`. It is created in the
  same transaction as the branch, and `branch_id` is **NOT NULL**. No `damaged`, `storage` or In transit locations
  yet.
- `stock_movement.location_id` and `stock_balance.location_id` are **NOT NULL from the first migration**, with the
  composite key `(branch_id, location_id)` → `location (branch_id, id)` (ADR 0034).
- Every movement and balance uses the branch's single location. The API and screens never show or accept a
  location: one location per branch makes "the branch" and "the location" the same thing.
- `stock_balance` is one row per `(business_id, branch_id, product_id, location_id)`. With one location per branch,
  that is one row per product per branch.

**Option A (rejected): no location at all.** Drop `location` and every `location_id`; key the balance on
`(business_id, branch_id, product_id)`. It is about 80 lines smaller now, but adding locations later means filling
`location_id` on movements already posted. That is an `UPDATE` of append-only rows, which the immutability trigger
refuses for every role and invariant 2 forbids. The only ways round it are a migration that lifts the trigger (an
exception to "posted is permanent") or a permanently nullable `location_id` meaning "the default". Both weaken a
rule we want to keep absolute.

### 2. No In transit state and no transfers

ADR 0021 section 1b is **deferred in full**, not changed:

- `stock_movement.branch_id` is **NOT NULL**. No `CHECK` exception, no branchless rows.
- `kind` is `opening`, `receipt`, `sale`, `adjustment` (decided by Munif, 23 Nov: no return kinds). "Returned by
  customer" and "Returned to supplier" are **reasons on an `adjustment`**, not movement kinds. `transfer` and `relocation` aren't allowed; the `CHECK` lists only these kinds.
- No `stock_transfer` table, no `stock_transfer_party_in_scope()`, no In transit RLS rule, no nightly In transit
  comparison.
- The `stock_balance` unique key is a plain unique index (every column NOT NULL), not `NULLS NOT DISTINCT`.

### 3. Effect on the `stock_movement` design

| ADR 0021 as amended on 21 Nov                                  | For the demo (this amendment)                                   |
| -------------------------------------------------------------- | --------------------------------------------------------------- |
| `branch_id` nullable for transfer movements                    | `branch_id NOT NULL`                                            |
| `location_id` → branch location or the business In transit     | `location_id NOT NULL` → the branch's one location (option B)   |
| second key `(business_id, location_id)` and a location trigger | not needed: the `(branch_id, location_id)` key covers every row |
| kinds include `transfer`, `relocation`                         | `opening`, `receipt`, `sale`, `adjustment` (no return kinds)    |
| `source_type`, `source_id`, unique per source line             | **unchanged**: transfers will be one more `source_type` later   |
| `unit_cost` required, a hidden field                           | unchanged                                                       |
| append-only; trigger refuses `UPDATE`/`DELETE` for every role  | unchanged                                                       |

### 4. Effect on the `stock_balance` cache (and `stock_cost`)

- `stock_balance`: one row per product per branch (through its one location), `CHECK (on_hand >= 0)`, `version`.
  `rebuildStockBalance()` (owner-only) recomputes it from the movements, exactly as section 3 of ADR 0021 says.
- `stock_cost` stays **separate**, one row per `(business_id, branch_id, product_id)`, holding the branch's weighted
  average (invariant 7). With one location per branch it could live on `stock_balance`, but keeping it apart now
  means adding locations later never moves the cost again.
- The screens (#36) read `stock_balance.on_hand` per product and branch. "Showroom / Warehouse" columns (ADR 0034)
  aren't shown; the approved Inventory design is already per branch.

### 5. What must stay true (unchanged by this amendment)

1. **Stock is a ledger:** on hand is the sum of `stock_movement.qty_delta`; `stock_balance` equals it at all times
   and can be rebuilt.
2. **Posted is permanent:** movements are never updated or deleted; a correction is a new `adjustment` movement.
3. **Negative stock is blocked:** `CHECK (on_hand >= 0)` in the database, and `409 stock.insufficient` from the
   service.
4. **Decrements are atomic:** `UPDATE stock_balance SET on_hand = on_hand - $qty … WHERE … AND on_hand >= $qty
RETURNING`, never read-then-write; increases take `SELECT … FOR UPDATE` on the `stock_cost` and balance rows
   (ADR 0021 section 2). Rows are locked in `(product_id, branch_id)` order, so two documents can't deadlock.
5. **One transaction:** `StockService.move` never opens one; the invoice, its movements and its journal commit
   together (invariant 4, ADR 0022).
6. **Serial units carry their own cost** and change status only by ADR 0020's conditional update.
7. **Tenancy:** both tables are branch-scoped with forced RLS and `branch_is_active(branch_id)` in `WITH CHECK`.

### 6. What transfers will need later, so this doesn't block them

Everything below is **additive**: new rows, new kinds, relaxed constraints, new tables. No posted movement is
rewritten.

1. **The In transit location:** relax `location.branch_id` to nullable with ADR 0034's rule (exactly one
   branchless location per business, kind `in_transit`), and insert it for each existing business.
2. **Movements:** relax `stock_movement.branch_id` to nullable with ADR 0021 section 1b's `CHECK`, add `transfer`
   and `relocation` to the kinds, add the `(business_id, location_id)` key and the location trigger. Existing rows
   already satisfy all of these.
3. **Balances:** rebuild the unique key as `NULLS NOT DISTINCT` (an index swap, no data change).
4. **New:** `stock_transfer`, its RLS function `stock_transfer_party_in_scope()`, and the transfer-only RLS rule.
   Transfer movements use `source_type = 'stock_transfer'`.
5. **Cost:** a transfer leg carries the sending branch's `stock_cost.avg_cost` at send. That works today because
   cost is already per branch.
6. **More locations** (storage, damaged): insert `location` rows. The branch's existing `sales_floor` row stays
   the default, so every past movement is already correct.

What would block transfers, and so must **not** be done now: `avg_cost` on `stock_balance`, dropping
`source_type`/`source_id`, a CHECK that ties `location_id` to `branch_id` in a way a branchless row can't satisfy,
or a balance key that would need data rewritten to add `location_id` (option A).

### 7. Effect on ADR 0034 (#73) and ADR 0041 (#83)

- **ADR 0034:** its 21 Nov decisions stand (locations, default `sales_floor`, one `damaged` per branch, one In
  transit per business) but are **deferred until after the demo**, except the `location` table in its smallest form
  (option B). Its tests 1 and 6 apply now; tests 3, 4 and 5 wait. Add a note to #73: "Partly built by ADR 0054;
  storage, damaged and In transit locations wait."
- **ADR 0041 (transfers):** deferred in full. The demo shows no transfers. The Inventory design's Transfers tab,
  "In transit" figure, "Transfer to a branch" and "Mark received" stay on sample data marked Demo data (decision 3); the provisional view shapes in #134 decide nothing (they say so).

## Tests to write first (real Postgres; run to see them fail)

From ADR 0021, kept as they are: 1 (ledger equals cache), 2 (negative refused, nothing written), 3 (two parallel
sales of the last unit: one wins), 4 (two parallel sales of one serial unit), 5 (weighted average), 6
(immutability), 7 (`TRUNCATE` refused), 8 (cross-business and cross-branch), 9 (`CHECK`s), 10 (no deadlock), 11
(`rebuildStockBalance()`), 12 (only `StockQuery` names `stock_balance`).

New, for this amendment:

13. **One location per branch:** a new branch gets exactly one `sales_floor` location in the same transaction, even
    if the step runs twice; a second location in the branch, or one with no branch, is refused.
14. **The location belongs to the branch:** a movement or balance row naming another branch's location is refused
    by the composite key.
15. **No In transit, no transfers:** a movement with `branch_id` null is refused (`NOT NULL`); a movement of kind
    `transfer` or `relocation` is refused by the `CHECK`.
16. **Per-branch totals:** on hand per product per branch equals the sum of that branch's movements, and the
    stock-on-hand read matches it for two branches with different stock.
17. **Ready for later (schema shape test):** `source_type` and `source_id` exist on `stock_movement`, `avg_cost`
    lives only on `stock_cost`, and every `location_id` is NOT NULL. A test that fails if someone takes a shortcut
    that would block section 6.

## Size

Option B adds about 80 lines to ADR 0021 part 1 (the minimal `location` table and its per-branch row) and removes
section 1b's work (the trigger, the second key, the branchless RLS rule and its tests), so part 1 stays near its
planned ~400 lines.

## Consequences

- **Easier:** the demo's stock work is the plain ledger: per-branch rows, no branchless RLS, no transfer state
  machine. Fewer things to review before 30 Nov.
- **Harder:** after the demo, transfers and extra locations come as a second migration (section 6), which still
  needs a plan review then.
- **Keep true:** section 5, all of it.
- **Undo:** before go-live, a new migration can drop both tables; after go-live, section 6 is the only way forward.

## Decisions (Munif, 23 Nov; for Farhan's review)

1. **Option B:** one location per branch. Option A is rejected because it would mean rewriting posted movements
   later.
2. **No return movement kinds.** "Returned by customer" and "Returned to supplier" are reasons on an `adjustment`
   movement. This answers ADR 0021 question 3 for the demo: no `sale_return` kind.
3. **No transfers and no locations in the demo.** The Inventory screen's Transfers tab and its "In transit" figure
   stay on sample data marked **Demo data**; nothing about them is built in the backend.

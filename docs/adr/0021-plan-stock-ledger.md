# 0021: Plan for the stock ledger (movements, balances, average cost)

| Field               | Value                                                                                                            |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Status              | Proposed                                                                                                         |
| Date                | 2026-11-21                                                                                                       |
| Deciders            | Munif, Farhan                                                                                                    |
| Owner               | Munif (Inventory; plan rows C1, C3, and the stock half of C4)                                                    |
| Spec / roadmap refs | spec F-01, F-02, F-07, F-08, I-08; CLAUDE.md invariants 2, 3, 4, 6, 7; ADR 0008 (#27), 0012 (#38), 0020; plan C3 |

## Context

**Stock is a ledger** (invariant 3): on hand is the sum of `stock_movement.qty_delta`, and `stock_balance` is a
cache that can be rebuilt. Negative stock is refused (F-08). Two cashiers selling the last unit: one wins (F-02,
invariant 6). Posted movements are never updated or deleted; a correction is a new movement (invariant 2).

**ADR 0012 (#38)** already fixes the contract: `IStockService.move(movements)`, with atomic decrements and a
fixed locking order. This ADR is the table plan behind it: the stock half of the feature plan's C1, next to
ADR 0020's products and units. The demo's sale (ADR 0022) and its stock-on-hand screen (#36) need it.
CLAUDE.md requires an agreed plan before stock or migration code. No code is in this PR.

## Decision

### 1. Tables (Inventory, `inventory.prisma`, migration `stock_ledger`)

The rules from #27 and #31 apply to both tables:

- `business_id`, ids from `uuid_v7()`, `created_at`, `created_by` (the caller).
- RLS enabled and forced, branch-scoped, with `branch_is_active(branch_id)` in `WITH CHECK`.
- `erp_app` policies `TO erp_app` with `FOR` clauses; no `DELETE` for any role; a `BEFORE TRUNCATE` trigger.

**`stock_movement`**, append-only:

| Column                     | Notes                                                                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `branch_id`                | composite foreign key `(business_id, branch_id)`                                                                                              |
| `location_id`              | composite foreign key `(branch_id, location_id)` → `location (branch_id, id)` (ADR 0034, #73): a movement can't use another branch's location |
| `product_id`               | composite foreign key `(business_id, product_id)`                                                                                             |
| `serial_unit_id`           | nullable; set for serial-tracked products, and then `qty_delta` is `1` or `-1` (`CHECK`)                                                      |
| `qty_delta`                | `numeric(18,3)`, never zero (`CHECK`); positive in, negative out                                                                              |
| `unit_cost`                | `numeric(18,2)`, required on every movement: the receipt cost in, the cost used out. **A hidden field**                                       |
| `kind`                     | `opening`, `receipt`, `sale`, `sale_return`, `adjustment` (later kinds come with their features)                                              |
| `source_type`, `source_id` | the document that made it (an invoice, a receipt). Unique per `(source_type, source_id, product_id, serial_unit_id)`                          |
| `movement_date`            | date, the business date in Asia/Dhaka                                                                                                         |

- `erp_app`: `SELECT`, `INSERT` only.
- Owner policies: `FOR SELECT` and `FOR INSERT` only, because it's append-only (ADR 0008, #27).
- A trigger refuses `UPDATE` and `DELETE` for every role, as journals do (ADR 0013).

**`stock_balance`**, the cache, one row per `(business_id, branch_id, product_id, location_id)` (locations,
ADR 0034, decided by Munif on 21 Nov):

| Column     | Notes                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------ |
| `on_hand`  | `numeric(18,3)`, `CHECK (on_hand >= 0)`: the database's own guard for F-08                 |
| `avg_cost` | **moved** to `stock_cost` below: the average is per branch (invariant 7), not per location |
| `version`  | `int`                                                                                      |

**`stock_cost`**, one row per `(business_id, branch_id, product_id)`: `avg_cost numeric(18,2)` and `version`. It
holds the branch's weighted average (invariant 7), so locations in one branch share one cost.

`erp_app`: `SELECT`, `INSERT`, `UPDATE (on_hand, version, updated_at)` on `stock_balance`, and
`UPDATE (avg_cost, version, updated_at)` on `stock_cost`. Only `StockQuery` writes them; a dal test fails if another file names `stock_balance` (the pattern ADR 0008 test 15 uses).

### 1b. The business In transit location (amended 21 Nov; decided by Munif for ADR 0041 question 4)

A transfer's stock on the road sits in **one In transit location per business, which belongs to no branch** (ADR
0034, amended). So each branch writes only its own side of a transfer (ADR 0041). That one location needs these
exceptions, and nothing else changes:

- **`stock_movement.branch_id` may be null**, only for a transfer movement: `CHECK (branch_id IS NOT NULL OR
(kind = 'transfer' AND source_type = 'stock_transfer'))`. The kinds gain `transfer` (ADR 0041) and `relocation`
  (a move inside one branch, ADR 0041 question 2).
- **Which location:** every movement also gets a foreign key `(business_id, location_id)` → `location (business_id,
id)`. The `(branch_id, location_id)` key doesn't check rows whose `branch_id` is null, so a `BEFORE INSERT`
  trigger requires `location.branch_id IS NOT DISTINCT FROM NEW.branch_id`: a branch movement can't use In transit,
  and a branchless movement can use only In transit.
- **`stock_balance`:** the key `(business_id, branch_id, product_id, location_id)` is `UNIQUE NULLS NOT DISTINCT`
  (PostgreSQL 16), so the business has one In transit row per product. `CHECK (on_hand >= 0)` stays, so the
  database itself refuses receiving more than is on the road.
- **Cost:** In transit has no `stock_cost` row; its movements carry the transfer line's `unit_cost` (the sending
  branch's average at send).
- **RLS for the branchless rows:**
  - `stock_movement`: `INSERT` and `SELECT` when the business is in scope **and** the transfer it names is visible
    to the caller, through `stock_transfer_party_in_scope(source_id)`: `SQL STABLE`, `SECURITY INVOKER`, fixed
    `search_path`, reading `stock_transfer` under the caller's own RLS (visible when either branch is in scope).
    Which side may write which leg is the transfer's status machine in the Manager (ADR 0041).
  - `stock_balance`: `SELECT` and `UPDATE (on_hand, version, updated_at)` when the business is in scope, through
    `StockQuery` only (test 12).
- The nightly check (C-13) adds one comparison: In transit on hand per product equals the open transfers' sent
  minus received minus written-off quantities.

### 2. Moving stock: `StockService.move` (ADR 0012), inside the caller's transaction

Movements are applied **sorted by `(product_id, branch_id)`**, so two documents touching the same items can't
deadlock.

- **Out (a sale):**

  ```sql
  UPDATE stock_balance
     SET on_hand = on_hand - $qty, version = version + 1
   WHERE business_id = $b AND branch_id = $br AND product_id = $p AND location_id = $loc AND on_hand >= $qty
  RETURNING on_hand;
  ```

  - The location is the branch's default `sales_floor` location for a POS sale (ADR 0034; not chosen per line in
    release 1). The cost comes from `stock_cost` (`SELECT avg_cost … FOR SHARE`), so a receipt can't change it
    mid-sale.
  - Zero rows means `409 CONFLICT`, field code `stock.insufficient`, and nothing is written. That's an atomic
    conditional update, never read-then-write (invariant 6).
  - For a serial unit, ADR 0020's conditional status change runs first. The movement's `unit_cost` is the
    unit's own cost; for other products it's the returned `avg_cost`.
  - Then the movement row is inserted with that cost. The caller gets the cost back, for the cost-of-goods
    journal line (ADR 0022).

- **In (a receipt, the opening stock):** `SELECT … FOR UPDATE` on the branch's `stock_cost` row, then on the
  location's balance row, inserting either first if it's missing (`INSERT … ON CONFLICT DO NOTHING`). Then the
  new weighted average is computed in businessLogic through the shared money helpers, never in SQL or with
  floats. The updates and the movement insert run under those row locks.
- **Weighted average:** `(on_hand × avg_cost + qty × unit_cost) ÷ (on_hand + qty)`, where `on_hand` is the
  branch's total for the product over all its locations, rounded half away from zero
  to paisa. `shared/src/utils/money.ts` has no division today, so a new shared helper
  `divideByQuantity(amount, quantity)` is needed (its own small shared PR, with property tests). Serial units
  don't average: each carries its own cost (invariant 7).
- **Same transaction** (invariant 4): `move` never opens a transaction. The invoice, its movements and its
  journal commit together (ADR 0022).

### 3. The balance is a cache, and stays one

- `stock_balance.on_hand` must always equal the sum of the movements for that product at that location.
- A test asserts that after every scenario in the test list.
- A `rebuildStockBalance()` SQL function, run as the owner, recomputes every row from the movements. It's used
  by the nightly integrity check later (D11); it isn't reachable from a request.

### 4. What the screens read

The stock-on-hand screen (#36) reads `stock_balance.on_hand` per product, branch and location (Showroom,
Warehouse and Total, ADR 0034). The movement history (I-08)
reads `stock_movement`, newest first, with no `unit_cost` until redaction exists (plan 2.5; the same rule as
ADR 0020 section 3).

## Tests to write first (real Postgres; run to see them fail)

1. A receipt raises `on_hand` and writes one movement; a sale lowers it and writes one; after every test,
   `on_hand` equals the sum of the movements.
2. **Negative stock is refused:** selling more than on hand gives `stock.insufficient`, and nothing is written
   (F-08).
3. **Two parallel sales of the last unit** of a part: exactly one succeeds (F-02).
4. **Two parallel sales of the same serial unit:** exactly one succeeds, through ADR 0020's status change.
5. **Weighted average:** 10 at ৳100.00, then 10 at ৳110.00, gives ৳105.00; a sale then uses ৳105.00 as its
   cost. Uneven cases round half away from zero (unit tests of `divideByQuantity`, with property tests).
6. A movement can't be updated or deleted, as `erp_app` or as the owner (0 rows and unchanged under forced RLS),
   and a role that bypasses RLS hits the trigger's error (the ADR 0013 test 5 split).
7. `TRUNCATE` on either table is refused for every role.
8. A movement pointing at another business's product, branch or unit is refused (composite keys); business Y
   can't see X's movements or balances (RLS); a branch-2-only scope can't see branch 1's.
9. `qty_delta = 0`, and a serial movement of `2`, are refused by the `CHECK`s.
10. Two documents moving the same two products in opposite orders don't deadlock (sorted order).
11. `rebuildStockBalance()` gives the same balances as the live cache after a mixed scenario.
12. Only `StockQuery` names `stock_balance` (dal source test).
13. **Locations** (ADR 0034): on hand per location equals the sum of that location's movements; a POS sale takes
    from the branch's default `sales_floor` location; two locations in one branch share one average cost.
14. **In transit** (section 1b): a branchless movement with a kind other than `transfer` is refused; a branch
    movement using In transit, or a branchless one using a branch location, is refused by the trigger; a user of a
    third branch can't insert an In transit movement for a transfer they can't see; In transit can't go below zero.

## Migration steps (written here, applied in the PR, not now)

1. Merge `main`; tell Farhan `stock_ledger` is in flight (plan section 6, row 12: after `product`).
2. Add both models to `inventory.prisma`; back-relations on `Branch` and `Product` (one line each).
3. `npm run db:migrate:new -- stock_ledger`; append RLS, grants, owner policies, the immutability and
   `TRUNCATE` triggers, the `CHECK`s and `rebuildStockBalance()` from `dal/sql/`; review the SQL.
4. `npm run db:migrate:check`; `db:migrate:deploy` on a throwaway Postgres; `test:integration`;
   `test:isolation`.

## Size and PR split

| Part | Branch               | Contents                                                          | Size (approx.) | Needs first            |
| ---- | -------------------- | ----------------------------------------------------------------- | -------------- | ---------------------- |
| 0    | `feat/money-divide`  | `divideByQuantity` in shared, with property tests (both review)   | ~120           | nothing                |
| 1    | `feat/stock-ledger`  | both tables, triggers, RLS, `StockQuery`, tests 1, 6 to 9, 11, 12 | ~400           | ADR 0020 parts 1 and 2 |
| 2    | `feat/stock-service` | `StockService` (ADR 0012 contract), tests 2 to 5, 10              | ~300           | part 1, part 0, #38    |
| 3    | `feat/stock-live`    | #36's screen on the real service, the movement list               | ~250           | part 2, #8, A6         |

## Blocked by

- **ADR 0020** (products and serial units).
- **ADR 0012** (#38), for `IStockService`.
- The rules agreed on #27 and #31.
- A3b part 1, and `uuid_v7()` (#29).

## Consequences

- **Easier:** every later stock feature (receipts, transfers, adjustments, counts) is a new movement kind
  through one service.
- **Harder:** a sale takes a row lock on each balance it touches; at shop volume that's milliseconds.
- **Keep true:** no stock change without a movement; the cache always equals the movements; never negative.
- **Undo:** before go-live, a new migration drops both tables.

## Open questions

1. ~~**Munif, Moto Mart:** stock by **location**?~~ **Decided by Munif, 21 Nov:** locations now (ADR 0034, #73).
   `location_id` is on `stock_movement` and `stock_balance` from the start, the average cost moved to `stock_cost`
   (per branch), and a POS sale takes from the branch's default `sales_floor` location. No bins.
2. **Both:** the weighted average rounds to paisa at each receipt. Accept the small drift, or store `avg_cost`
   with more decimals? Recommended: paisa, as the accountant will see it.
3. **Farhan:** is `sale_return` needed for release 1 (C14), or can it wait with returns?
4. ~~**Munif:** where does a transfer's stock sit on the road?~~ **Decided by Munif, 21 Nov (ADR 0041 question
   4):** one In transit location per business, belonging to no branch, with the exceptions in section 1b.

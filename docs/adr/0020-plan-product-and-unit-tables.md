# 0020: Plan for the product and bike unit tables

| Field               | Value                                                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Status              | Proposed                                                                                                                     |
| Date                | 2026-11-21                                                                                                                   |
| Deciders            | Munif, Farhan                                                                                                                |
| Owner               | Munif (Product, Inventory, Vehicle; plan rows C1, C2, C4, C5)                                                                |
| Spec / roadmap refs | spec P-05, P-10, F-02, F-03, F-06, O-11; CLAUDE.md invariants 3, 6, 7; ADR 0008 (#27), 0009 (#31), 0012 (#38); plan C1 to C5 |

## Context

The 29 Nov demo sells a bike by its chassis number at the POS and shows it on the "products by chassis" screen
(demo script #49, steps 4 to 8). That needs a product catalogue and one row per physical unit. Today the product
list and stock screens (#34 to #36) run on mock services, and no table exists.

The feature plan reserved this as C1, "product and inventory schema", under a number now taken. This ADR is the
**product and unit half**; ADR 0021 is the stock ledger, and ADR 0022 is posting a sale. CLAUDE.md requires an
agreed plan before stock, tenancy or migration code. No code is in this PR.

**Core stays generic** (spec O-11, CLAUDE.md): the core has a product and a **unit with a serial number**. The
chassis label, engine number and colour belong to the Vehicle pack.

## Decision

### 1. Tables

Every table follows the rules agreed on #27 and #31:

- `business_id` on every row, ids from `uuid_v7()` (#29), `created_at`, `updated_at`, and `created_by` (the
  caller; `NULL` only when seeded).
- RLS enabled and forced.
- `erp_app` policies `TO erp_app` with a `FOR` clause per granted command.
- Owner policies `TO CURRENT_USER`, `FOR SELECT`, `INSERT` and `UPDATE`, and no owner `DELETE` policy.
- `REVOKE DELETE` from `erp_app`, and a `BEFORE TRUNCATE` trigger that refuses it for every role.
- Composite foreign keys with `business_id`, so no row can point at another business's row.

**`product`** (Product, `product.prisma`, migration `product_catalogue`):

| Column       | Notes                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------ |
| `code`       | text, unique per business (`@@unique([businessId, code])`)                                 |
| `name`       | text; `name_bn` nullable                                                                   |
| `brand`      | text, nullable; one brand per product in release 1 (P-10). Open question 1                 |
| `category`   | text, nullable. Open question 1                                                            |
| `unit`       | text, the unit of measure shown next to quantities (`pcs`, `set`, `bottle`)                |
| `tracking`   | `serial` or `quantity`. Serial-tracked products sell one unit per line                     |
| `sell_price` | `numeric(18,2)`, the current price. Invoices copy the price (P-07); price history is later |
| `status`     | `active` or `archived`. **An archived product can't be sold** (C2)                         |
| `version`    | `int NOT NULL DEFAULT 1`, raised by the edit's Query                                       |

Business-level RLS (no branch). `erp_app`: `SELECT`, `INSERT`, and `UPDATE` on every column except `id`,
`business_id`, `code` and `tracking`. Changing `tracking` after units exist would orphan them, so it's refused.

**`serial_unit`** (Inventory, `inventory.prisma`, migration `serial_units`): one row per physical unit.

| Column            | Notes                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| `branch_id`       | composite foreign key `(business_id, branch_id)`; where the unit is                                    |
| `product_id`      | composite foreign key `(business_id, product_id)`; the product must be `tracking = 'serial'` (trigger) |
| `serial_no`       | text, unique per business (F-03). The Vehicle pack labels it "Chassis number"                          |
| `status`          | `in_stock`, `reserved`, `sold` or `delivered` (F-06). `registered` waits for plan Q2                   |
| `unit_cost`       | `numeric(18,2)`. Serial units carry their own cost (invariant 7). **A hidden field** (plan 2.5)        |
| `invoice_id`      | nullable; the sale that sold it (ADR 0022)                                                             |
| `reserved_by_ref` | nullable; the booking that reserved it (plan 3.5, later)                                               |
| `version`         | `int NOT NULL DEFAULT 1`                                                                               |

Branch-scoped RLS: the business check plus `branch_id = ANY ((SELECT app_branch_ids())::uuid[])`, and
`branch_is_active(branch_id)` in `WITH CHECK`. If this table merges before A13's `journal` and A15's
`sales_payment`, it carries the deactivated-branch half of test 7 (ADR 0009).

**`vehicle_unit`** (Vehicle pack, `vehicle.prisma`, migration `vehicle_units`): the pack's extra columns for a unit.

| Column           | Notes                                                              |
| ---------------- | ------------------------------------------------------------------ |
| `serial_unit_id` | primary key; composite foreign key `(business_id, serial_unit_id)` |
| `engine_no`      | text, unique per business (C5)                                     |
| `colour`         | text                                                               |

Same RLS as `serial_unit`, through its business and the unit's branch.

### 2. How a unit's status changes (F-02, invariant 6)

- **Only by a conditional `UPDATE`**, never read-then-write:

  ```sql
  UPDATE serial_unit
     SET status = 'sold', invoice_id = $invoice, version = version + 1
   WHERE id = $unit AND branch_id = $branch AND status = 'in_stock'
  RETURNING unit_cost;
  ```

  Zero rows means `409 CONFLICT`, field code `unit.not_available`. Two cashiers, one chassis: one wins.

- **Allowed changes only:** a trigger refuses any other status change: `in_stock → reserved → in_stock`,
  `in_stock|reserved → sold`, `sold → delivered`. A sale's void (C14) returns the unit through its own
  allowed change, planned with C14.
- **`erp_app`'s `UPDATE`** is column-level: `status`, `invoice_id`, `reserved_by_ref`, `version`, `updated_at`.
  `serial_no`, `product_id` and `unit_cost` never change. `branch_id` changes only with transfers (C6, later),
  so release 1 grants no `UPDATE` on it.

### 3. Hidden cost, before redaction exists

`unit_cost` is a hidden field (plan 2.5), but redaction (B4, B5) comes after the slice. Until then:

- No list or detail DTO returns `unit_cost`. Only ADR 0021's stock service reads it, for the cost of goods.
- A test checks that every product and unit response schema lacks `unit_cost`.

### 4. Code

- **dal:** `ProductQuery` (list, find, create, edit with the version check), `SerialUnitQuery` (find by serial
  number, list by branch, the conditional status change), DTOs with money and quantity strings (A10a, #42).
- **businessLogic:** `ProductManager`, plus `IUnitSale` provided by Inventory (ADR 0012 pattern): `sell(unitId,
branchId, invoiceId)`, returning the unit's cost to the sale (ADR 0022).
- **shared:** the product and stock schemas from #34, extended with the unit row (shared: both review).
- **No routes in this ADR's first part.** The product list route comes with part 2; the sale goes through
  ADR 0022.

## Tests to write first (real Postgres; run to see them fail)

1. A product, a serial unit and its vehicle row are created in business X and read back; business Y can't see
   or guess any of them (RLS), and Y's branch can't see X's units.
2. A unit pointing at another business's product or branch is refused by the composite foreign keys.
3. A unit of a `quantity`-tracked product is refused (trigger).
4. A second unit with the same `serial_no` in the business is refused (F-03); the same in another business is
   accepted. A second `engine_no` likewise (C5).
5. **Two parallel sells of one unit:** exactly one gets the row; the other gets `unit.not_available`, and
   nothing of its transaction remains (F-02).
6. A refused status change (`sold → in_stock`, `delivered → sold`) raises from the trigger.
7. `erp_app` can't change `serial_no`, `product_id`, `unit_cost` or `branch_id` (permission denied), or a
   product's `code` or `tracking`.
8. As the owner (neither superuser nor `BYPASSRLS`), a `DELETE` removes 0 rows and the rows remain; `TRUNCATE`
   is refused for every role.
9. Selling a unit of an archived product is refused (`409`, `product.archived`).
10. No product or unit response schema includes `unit_cost` (unit test over the shared schemas).
11. If this is the first branch-scoped table to merge: a unit can't be inserted under a deactivated branch
    (`branch_is_active`, ADR 0009 test 7).

## Migration steps (written here, applied in each PR, not now)

1. Merge `main`; tell Farhan the migration is in flight (plan section 6, row 12: product, then inventory,
   then vehicle).
2. Add the models to `product.prisma`, `inventory.prisma` and `vehicle.prisma`; back-relations on `Business` and
   `Branch` in `organization.prisma` (one line each).
3. `npm run db:migrate:new -- <name>`; append RLS, grants, the owner policies, the status and tracking
   triggers and the `TRUNCATE` trigger from `dal/sql/`; review the SQL.
4. `npm run db:migrate:check`; `db:migrate:deploy` on a throwaway Postgres; `test:integration`;
   `test:isolation`.

## Size and PR split

| Part | Branch               | Contents                                                      | Size (approx.) | Needs first                |
| ---- | -------------------- | ------------------------------------------------------------- | -------------- | -------------------------- |
| 1    | `feat/product-table` | `product`, its RLS and Query, tests 1, 7, 8 (product half)    | ~350           | A3b part 1 (#31), #29, #27 |
| 2    | `feat/serial-units`  | `serial_unit`, status trigger, `IUnitSale`, tests 1 to 11     | ~400           | part 1, #38                |
| 3    | `feat/vehicle-units` | `vehicle_unit` (Vehicle pack), test 4 (engine half)           | ~200           | part 2                     |
| 4    | `feat/product-live`  | the #35 and #36 screens on the real services, the list routes | ~300           | parts 1 and 2, #8, A6      |

## Blocked by

- **A3b part 1** (`business`, `branch`), ADR 0009 (#31); **`uuid_v7()`** (#29); the owner-policy rules in
  ADR 0008 (#27).
- **ADR 0012** (#38), for the `IUnitSale` contract.

## Consequences

- **Easier:** the POS can sell a bike by its chassis number, and two cashiers can't sell the same one.
- **Harder:** a unit's history is only its status changes until the movement history (ADR 0021) and the
  activity record (B2) exist.
- **Keep true:** units change status only by conditional update; no unit cost reaches a screen until redaction.
- **Undo:** before go-live, new migrations drop the tables.

## Open questions

1. **Munif:** brand and category as text columns in release 1, or `brand` and `category` tables now? Recommended:
   text now; tables when a screen needs to manage them.
2. **Both:** `serial_no` unique per business (recommended for release 1) or per organization? A chassis is
   physically unique, but a per-organization unique would reveal across businesses that a number exists.
3. **Farhan:** must a bike sale name a customer, or may a bike go to the walk-in party? Recommended: a named
   customer for serial units (registration needs one).
4. **Both (plan Q2):** does the status flow end at `registered`? Not added until Q2 is answered.
5. **Munif:** is the Vehicle pack on per business, and where is that stored? Recommended: a `packs` text array on
   `business`, which touches ADR 0009.

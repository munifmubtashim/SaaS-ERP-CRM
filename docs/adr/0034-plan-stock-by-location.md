# 0034: Plan for stock by location

| Field               | Value                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------- |
| Status              | Proposed                                                                                      |
| Date                | 2026-11-21                                                                                    |
| Deciders            | Munif, Farhan                                                                                 |
| Owner               | Munif (Inventory; plan row C3, "locations")                                                   |
| Spec / roadmap refs | spec I-06, I-10; CLAUDE.md invariant 3; ADR 0020 (#58), 0021 (#59); plan 1.5 (release 1), 3.1 |

## Context

Moto Mart's release 1 includes **stock by location** (plan 1.5): a showroom floor and a store in one branch.
ADR 0021 (#59) keeps stock per branch and lists locations as its open question 1. This ADR plans them.

**Neither table is built yet**, so the recommended order is to add `location_id` to ADR 0021's tables from the
start: one migration, not a later change. It's a stock and migration change, so CLAUDE.md requires an agreed
plan. No code is in this PR.

## Decision

### Table `location` (Inventory, migration `stock_locations`, before `stock_ledger`)

| Column      | Notes                                                           |
| ----------- | --------------------------------------------------------------- |
| `branch_id` | composite foreign key `(business_id, branch_id)`                |
| `name`      | text, unique per branch                                         |
| `type`      | `sales_floor`, `storage`, `in_transit`, `damaged`, `quarantine` |
| `is_active` | boolean                                                         |

The table rules on #27 and #31 apply. It's branch-scoped RLS, with `branch_is_active(branch_id)` in `WITH CHECK`.
`@@unique([branchId, id])` lets movements prove a location belongs to their branch.

### Changes to ADR 0021's tables, before they're built

- **`stock_movement`** gains `location_id NOT NULL`, with a composite foreign key `(branch_id, location_id)` →
  `location (branch_id, id)`. A movement can't use another branch's location.
- **`stock_balance`** is keyed by `(business_id, branch_id, product_id, location_id)`.
- **`serial_unit`** (ADR 0020) gains `location_id`, changed in the same transaction as its movement.

### Rules

- **Sellable** = `sales_floor` and `storage` only. A sale from `damaged`, `quarantine` or `in_transit` is refused
  (`409`, `stock.not_sellable`).
- **On screen:**
  - **Showroom** = the sum over `sales_floor` locations;
  - **Warehouse** = the sum over `storage` locations;
  - **Total** = the sellable sum;
  - the other types are shown separately (I-06).
- **Every branch has one `in_transit` and one `damaged` location.** They're created right after the branch, in the
  new branch's scope as `erp_app`, with `INSERT … ON CONFLICT DO NOTHING`. That's the same pattern as the walk-in
  party (ADR 0010).
- **Bins** (I-10) aren't in this plan (open question 1).

## Invariants touched

Stock (invariant 3: on hand per location is the sum of its movements), tenancy (branch-scoped), migration.

## Tests to write first

1. On hand per location equals the sum of that location's movements; the branch total equals the sum over its
   locations.
2. A movement using another branch's location is refused (composite key).
3. A sale from a `damaged` or `in_transit` location is refused with `stock.not_sellable`.
4. A new branch gets exactly one `in_transit` and one `damaged` location, even if the step runs twice.
5. Showroom, Warehouse and Total match the definitions above.
6. RLS: a branch-2-only scope can't see branch 1's locations.

## Dependencies

- ADR 0021 (#59) and ADR 0020 (#58): to be built with `location_id` from the start once this is agreed.
- ADR 0009 (#31), ADR 0010 (#32), for the step after branch creation.

## Size and PR split

| Part | Contents                                                                      | Size |
| ---- | ----------------------------------------------------------------------------- | ---- |
| 1    | `location` table, the auto-created locations, tests 2, 4, 6                   | ~300 |
| —    | `location_id` in ADR 0021 part 1 and ADR 0020 part 2 (tests 1, 3, 5 go there) | +~80 |

## Consequences

- **Easier:** the stock screen matches the design's Showroom and Warehouse columns.
- **Harder:** every sale must pick a location (open question 2).
- **Undo:** before go-live, drop `location` and the columns in a new migration.

## Open questions (with recommended answers)

1. **Munif, Moto Mart:** bins (I-10) in release 1? Recommended: no, locations only; bins later.
2. **Munif:** which location does a POS sale take from? Recommended: a default `sales_floor` location per branch,
   changeable on the sale line.
3. **Munif:** should ADR 0021 be updated to include `location_id`, or does this ADR stand as its amendment?
   Recommended: amend ADR 0021 (#59) once both are agreed.

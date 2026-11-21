# 0041: Plan for stock transfers with approval and In transit (C6)

| Field               | Value                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| Status              | Proposed                                                                                                        |
| Date                | 2026-11-21                                                                                                      |
| Deciders            | Munif, Farhan                                                                                                   |
| Owner               | Munif (Inventory; plan row C6)                                                                                  |
| Spec / roadmap refs | spec I-07, I-08, I-09, O-06; CLAUDE.md invariants 1 to 6; ADR 0013, 0021, 0030, 0034, 0040; plan 3.1 "Transfer" |

## Context

- **I-07:** a transfer between branches needs approval, shows as **In transit**, is confirmed on receipt, and
  highlights quantity differences.
- **O-06:** the sending and the receiving branch both confirm, both sides post to accounts, and unconfirmed
  transfers are listed.
- **I-09:** the Movements and Transfers tabs were never reviewed at design stage, so every step is tested end to
  end here.

ADR 0034 (#73) gives every branch one `in_transit` location. ADR 0021 (#59) gives the movements, the per-branch
average cost (`stock_cost`) and the atomic decrement. ADR 0030 (#68, Farhan) gives approvals; `transfer` is one
of its waiting kinds.

This is a stock, ledger, tenancy and migration change, so CLAUDE.md requires an agreed plan. No code is in this
PR.

## Decision

### Tables (Inventory, migration `stock_transfers`)

| Table                 | Columns and notes                                                                                                                                                                                                                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stock_transfer`      | `from_branch_id`, `from_location_id`, `to_branch_id`, `to_location_id` (composite keys to `location (branch_id, id)`, ADR 0034); `status`; `memo`; `sent_by`, `sent_at`, `received_by`, `received_at`; `from_journal_id`, `to_journal_id` (the two journals posted on receive, see Accounting); `version` |
| `stock_transfer_line` | `product_id`, `serial_unit_id` (null for parts), `qty_sent` (`numeric(18,3)`, > 0), `qty_received` (null until received, then 0 ≤ `qty_received` ≤ `qty_sent`), `unit_cost` (the sending branch's cost at send, `numeric(18,2)`)                                                                          |

- **Status:** `requested` → `approved` (or `rejected`) → `in_transit` → `received` or `received_short`. A
  `requested` or `approved` transfer can be `cancelled`; an `in_transit` one can't (the stock has left).
- **Each step is an atomic conditional `UPDATE … WHERE status = $expected AND version = $read`** (invariant 6),
  so two people can't send or receive the same transfer twice. Zero rows: `409 CONFLICT`, `transfer.stale`.
- The rules on #27 and #31 apply: forced RLS, no `DELETE`, the `TRUNCATE` trigger, key columns frozen.
  `qty_received` can be set once (a trigger refuses a change from a non-null value), and `unit_cost` never.
- **RLS:** a transfer is visible when **either** branch is in the caller's scope (`from_branch_id = ANY(…) OR
to_branch_id = ANY(…)`), so both branches see it in their Transfers tab. Writes check the branch each step
  needs (below).

### Flow

1. **Request** (sending branch in scope): lines, the two locations. A transfer between two locations **of the same
   branch** is a plain move instead (open question 2).
2. **Approve:** `IApprovalService.request('transfer', …)` (ADR 0030). A different user approves (`approval.self`).
3. **Send** (sending branch in scope), one transaction:
   - `IStockService.move` out of `from_location_id` and into the **sending branch's** `in_transit` location, at the
     sending branch's average cost (serial units at their own cost). Refused with `stock.insufficient` if it would
     go negative (invariant 3, F-08).
   - `unit_cost` on each line is set from that move. Status `in_transit`.
   - No journal: the stock is still the sending branch's inventory, now in a different location.
   - **In transit** on screen is that `in_transit` location's balance.
4. **Receive** (both branches in scope; open question 1), one transaction:
   - The receiver enters `qty_received` per line (for serial units: each unit received or not).
   - `IStockService.move` out of the sending branch's `in_transit` and into `to_location_id`, for the received
     quantity, at the line's `unit_cost`. The receiving branch's average cost takes these units in like a receipt.
   - The two journals below. Status `received`, or `received_short` when any line has `qty_received < qty_sent`.
   - Receiving more than was sent is refused (`transfer.over_received`). Extra stock found is a stock adjustment
     (ADR 0040).
5. **A shortage stays in the sending branch's `in_transit` location**, so the ledger still holds it. A
   `received_short` transfer appears in the Action Center as **"transfer mismatch"** (derived query, plan 2.4)
   until the missing quantity is resolved by a stock adjustment from `in_transit` (ADR 0040, with its approval)
   or found and moved.
6. **Serial units:** one ±1 movement per unit with `serial_unit_id`, and `serial_unit.location_id` changes in the
   same transaction (ADR 0034).

Every send and receive `POST` accepts `Idempotency-Key` (invariant 5, ADR 0011). Each step writes an activity
event (ADR 0032).

### Accounting (O-06: both sides post)

Books are per business (ADR 0001), and each journal has one `branch_id` (ADR 0013). Moving value between branches
therefore posts one journal **per branch, on receive**, each balanced, through `PostingService.post`, with a new
account role **`inter_branch`** (the due-to/due-from account):

| Branch    | Journal on receive                                 |
| --------- | -------------------------------------------------- |
| Sending   | Dr `inter_branch`, Cr `inventory` (received value) |
| Receiving | Dr `inventory`, Cr `inter_branch` (the same value) |

- Across the business, `inter_branch` nets to zero; per branch, it shows what one branch owes another.
- The send needs no journal: the value stays in the sending branch's `inventory` while in its `in_transit`
  location. A shortage written off later posts through ADR 0040 (Dr `inventory_loss`, Cr `inventory`).
- Both journal ids are stored on the transfer (invariant 4).
- Cash transfers between branches (C5) reuse the same `inter_branch` role; they are a separate plan.

### Routes and permissions (Inventory)

| Route                                  | Permission                   |
| -------------------------------------- | ---------------------------- |
| `GET /v1/stock-transfers`, `GET …/:id` | `inventory.transfer.view`    |
| `POST /v1/stock-transfers`             | `inventory.transfer.request` |
| `POST /v1/stock-transfers/:id/send`    | `inventory.transfer.send`    |
| `POST /v1/stock-transfers/:id/receive` | `inventory.transfer.receive` |
| `POST /v1/stock-transfers/:id/cancel`  | `inventory.transfer.request` |
| (approval, through ADR 0030's routes)  | `inventory.transfer.approve` |

Default mapping (each module adds its codes in its own PR, #26): Owner and Business Manager all; Branch Manager
view, request, send, receive; Accountant view; Cashier none. Every tenant route gets its isolation case.

## Invariants touched

1 and 4 (two balanced journals, ids stored), 2 (lines and movements never edited; a correction is an adjustment),
3 (stock only through movements; the shortage stays on the ledger), 5 (idempotent send and receive), 6 (status
steps and decrements are atomic), 7 (cost moves at the sending branch's cost into the receiving branch's
average), tenancy (two branches in one write).

## Tests to write first

1. A `requested` transfer moves nothing; only an `approved` one can be sent; the requester can't approve it.
2. Send moves stock from the source to the sending branch's `in_transit`; Showroom/Warehouse drop, In transit
   rises, the branch total is unchanged; no journal.
3. Send that would go negative is refused with `stock.insufficient`, and nothing moves.
4. Receive with full quantities: stock arrives at the destination, `in_transit` returns to zero, two balanced
   journals post, `inter_branch` nets to zero across the business, and the receiving branch's average cost moves
   as a receipt would.
5. Receive short (8 of 10): 8 arrive, 2 stay in `in_transit`, status `received_short`, the Action Center lists
   "transfer mismatch", and the journals carry 8 units' value.
6. Receiving more than was sent is refused; `qty_received` can't be changed once set.
7. Two people sending (or receiving) the same transfer at once: exactly one succeeds; the other gets
   `transfer.stale`. A repeated `POST` with the same `Idempotency-Key` returns the first result.
8. Serial unit: the unit's `location_id` follows each step; a unit not received stays in `in_transit`.
9. Isolation: a user of business Y sees nothing of X's transfers; a user scoped to a third branch of X sees
   nothing; a user scoped to only one of the two branches sees the transfer but can't do the step that needs the
   other branch.
10. I-09 end to end: request, approve, send, receive, and the Movements tab lists each movement with who, when,
    why, and before and after quantity (I-08).

## Dependencies

- ADR 0021 (#59) and ADR 0034 (#73) built: movements, `in_transit` locations, `stock_cost`.
- ADR 0030 (#68, Farhan) for approvals; ADR 0013 (#39) for posting, plus the `inter_branch` role added to ADR 0012's
  role list (#38).
- ADR 0011 (#37) idempotency; ADR 0032 (#71) activity record; ADR 0040 (#79) to resolve shortages.

## Size and PR split

| Part | Contents                                                                       | Size |
| ---- | ------------------------------------------------------------------------------ | ---- |
| 1    | tables, request, approval, send; tests 1 to 3, 7 (send), 9                     | ~400 |
| 2    | receive, journals, shortage, Action Center query; tests 4 to 6, 7 (receive), 8 | ~400 |
| 3    | Transfers tab and the I-09 end-to-end test (10)                                | ~300 |

## Consequences

- **Easier:** every unit is always somewhere on the ledger, including on the road; a shortage can't disappear.
- **Harder:** a receive writes to two branches, so the receiving user needs both in scope (open question 1).
- **Undo:** before go-live, drop the two tables in a new migration; the `inter_branch` role stays harmless.

## Open questions (with recommended answers)

1. **Munif:** a receive writes to both branches (out of the sending branch's `in_transit`, into the destination),
   and RLS only allows the caller's own branches. Who can receive?
   - **Recommended:** a user whose scope covers both branches (Owner, Business Manager, or a Branch Manager given
     both). The receiving branch's staff can see the transfer and print the delivery note, and the screen says who
     can confirm.
   - Alternative: the receiving branch's staff record what arrived (no stock moves), and a two-branch user posts
     it. Two steps, and the stock waits for the second person.
2. **Munif:** a move between two locations of the **same** branch (showroom to store): a transfer with approval,
   or a plain move? **Recommended:** a plain move, one step, no approval and no journal (`kind = 'relocation'`),
   with its activity event. I-07 asks for approval only between branches.
3. **Both:** is `inter_branch` one account per business, or one per pair of branches? **Recommended:** one account;
   each journal's `branch_id` already says which branch owes. Per-pair accounts can come with C5 if the
   accountant asks.

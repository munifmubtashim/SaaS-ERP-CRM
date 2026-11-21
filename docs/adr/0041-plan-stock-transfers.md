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

| Table                 | Columns and notes                                                                                                                                                                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stock_transfer`      | `from_branch_id`, `from_location_id`, `to_branch_id`, `to_location_id` (composite keys to `location (branch_id, id)`, ADR 0034); `status`; `memo`; `sent_by`, `sent_at`, `received_by`, `received_at`; `send_journal_id`, `receive_journal_id`, `write_off_journal_id` (see Accounting); `version` |
| `stock_transfer_line` | `product_id`, `serial_unit_id` (null for parts), `qty_sent` (`numeric(18,3)`, > 0), `qty_received` (null until received, then 0 ≤ `qty_received` ≤ `qty_sent`), `unit_cost` (the sending branch's cost at send, `numeric(18,2)`)                                                                   |

- **Status:** `requested` → `approved` (or `rejected`) → `in_transit` → `received`, or `received_short` →
  `closed_short` after a write-off. A `requested` or `approved` transfer can be `cancelled`; an `in_transit` one
  can't (the stock has left).
- **Each step is an atomic conditional `UPDATE … WHERE status = $expected AND version = $read`** (invariant 6),
  so two people can't send or receive the same transfer twice. Zero rows: `409 CONFLICT`, `transfer.stale`.
- The rules on #27 and #31 apply: forced RLS, no `DELETE`, the `TRUNCATE` trigger, key columns frozen.
  `qty_received` can be set once (a trigger refuses a change from a non-null value), and `unit_cost` never.
- **RLS:** a transfer is visible when **either** branch is in the caller's scope (`from_branch_id = ANY(…) OR
to_branch_id = ANY(…)`), so both branches see it in their Transfers tab. Writes check the branch each step
  needs (below).

### Flow (decided design: one In transit location per business, question 4)

The business has **one In transit location that belongs to no branch** (ADR 0034, amended). Each step writes only
its own branch's rows plus that location's rows, so **each branch confirms its own side** (O-06).

1. **Request** (sending branch in scope): lines, the two locations. A move between two locations **of the same
   branch** is a plain move instead (question 2).
2. **Approve:** `IApprovalService.request('transfer', …)` (ADR 0030). A different user approves (`approval.self`).
3. **Send** (sending branch in scope), one transaction:
   - `IStockService.move` out of `from_location_id` and into the business In transit location, at the sending
     branch's average cost (serial units at their own cost). Refused with `stock.insufficient` if it would go
     negative (invariant 3, F-08).
   - `unit_cost` on each line is set from that move. The sending branch's journal posts (below). Status
     `in_transit`.
4. **Receive** (receiving branch in scope), one transaction:
   - The receiver enters `qty_received` per line (for serial units: each unit received or not).
   - `IStockService.move` out of In transit and into `to_location_id`, for the received quantity, at the line's
     `unit_cost`. The receiving branch's average cost takes these units in like a receipt.
   - The receiving branch's journal posts. Status `received`, or `received_short` when any line has `qty_received
< qty_sent`.
   - Receiving more than was sent is refused (`transfer.over_received`). Extra stock found is a stock adjustment
     (ADR 0040).
5. **A shortage stays in In transit**, so the ledger still holds it, and the transfer appears in the Action Center
   as **"transfer mismatch"** (ADR 0045) until it's resolved:
   - **found:** a late receive of the missing quantity (same step 4);
   - **lost:** `POST …/write-off-shortage` by the sending branch, approved by another user (ADR 0030, kind
     `transfer_write_off`). It moves the quantity out of In transit and posts the sending branch's loss journal.
     Status `closed_short`.
   - So **every movement in or out of the In transit location belongs to a transfer** (`source_type =
'stock_transfer'`), which ADR 0021's check relies on.
6. **Serial units:** one ±1 movement per unit with `serial_unit_id`, and `serial_unit.location_id` changes in the
   same transaction (ADR 0034).

Every send, receive and write-off `POST` accepts `Idempotency-Key` (invariant 5, ADR 0011). Each step writes an
activity event (ADR 0032).

**Fallback (question 1's decision):** if the business-level location is dropped before ADR 0021 and 0034 are
built, each branch keeps its own `in_transit` location and a receive needs a user with both branches in scope.

### Accounting (O-06: both sides post)

Books are per business (ADR 0001), and each journal has one `branch_id` (ADR 0013). Each step posts **one balanced
journal for the branch that does it**, through `PostingService.post`, with the account role **`inter_branch`** (the
due-to/due-from account, one per business):

| Step                   | Branch    | Journal                                                   |
| ---------------------- | --------- | --------------------------------------------------------- |
| Send (10)              | Sending   | Dr `inter_branch`, Cr `inventory` (10 at `unit_cost`)     |
| Receive (8)            | Receiving | Dr `inventory`, Cr `inter_branch` (8 at `unit_cost`)      |
| Write off shortage (2) | Sending   | Dr `inventory_loss`, Cr `inter_branch` (2 at `unit_cost`) |

- Across the business, `inter_branch` equals the value still in In transit; it's zero once every transfer is
  received or written off. The nightly check (C-13) compares the two.
- Each journal id is stored on the transfer (`send_journal_id`, `receive_journal_id`, `write_off_journal_id`;
  invariant 4).
- Cash transfers between branches (C5) reuse the same `inter_branch` role; they are a separate plan.

### Routes and permissions (Inventory)

| Route                                             | Permission                   |
| ------------------------------------------------- | ---------------------------- |
| `GET /v1/stock-transfers`, `GET …/:id`            | `inventory.transfer.view`    |
| `POST /v1/stock-transfers`                        | `inventory.transfer.request` |
| `POST /v1/stock-transfers/:id/send`               | `inventory.transfer.send`    |
| `POST /v1/stock-transfers/:id/receive`            | `inventory.transfer.receive` |
| `POST /v1/stock-transfers/:id/write-off-shortage` | `inventory.transfer.send`    |
| `POST /v1/stock-transfers/:id/cancel`             | `inventory.transfer.request` |
| (approvals, through ADR 0030's routes)            | `inventory.transfer.approve` |

Default mapping (each module adds its codes in its own PR, #26): Owner and Business Manager all; Branch Manager
view, request, send, receive; Accountant view; Cashier none. Every tenant route gets its isolation case.

## Invariants touched

1 and 4 (one balanced journal per step, ids stored), 2 (lines and movements never edited), 3 (stock only through
movements; the shortage stays on the ledger until written off), 5 (idempotent steps), 6 (status steps and
decrements are atomic), 7 (cost moves at the sending branch's cost into the receiving branch's average), tenancy
(each step writes only its own branch plus the business In transit location, under ADR 0021's rule).

## Tests to write first

1. A `requested` transfer moves nothing; only an `approved` one can be sent; the requester can't approve it.
2. Send moves stock from the source into In transit; the sending branch's Showroom/Warehouse drop; its journal
   posts (Dr `inter_branch`, Cr `inventory`).
3. Send that would go negative is refused with `stock.insufficient`, and nothing moves or posts.
4. **A user scoped only to the receiving branch** receives in full: stock arrives, In transit returns to zero, the
   receiving journal posts, `inter_branch` nets to zero across the business, and the receiving branch's average
   cost moves as a receipt would.
5. Receive short (8 of 10): 8 arrive, 2 stay in In transit, status `received_short`, the Action Center lists
   "transfer mismatch", and `inter_branch` across the business equals the 2 units' value.
6. Write-off of the 2, approved by another user: In transit is zero, the loss journal posts, `inter_branch` nets to
   zero, status `closed_short`.
7. Receiving more than was sent is refused; `qty_received` can't be changed once set.
8. Two people sending (or receiving) the same transfer at once: exactly one succeeds; the other gets
   `transfer.stale`. A repeated `POST` with the same `Idempotency-Key` returns the first result.
9. Serial unit: the unit's `location_id` follows each step; a unit not received stays in In transit.
10. Isolation: a user of business Y sees nothing of X's transfers or In transit rows; a user scoped to a third
    branch of X sees no transfer and can't write an In transit movement; a receiving-branch user can't send, and a
    sending-branch user can't receive.
11. I-09 end to end: request, approve, send, receive, write-off, and the Movements tab lists each movement with
    who, when, why, and before and after quantity (I-08).

## Dependencies

- ADR 0021 (#59) and ADR 0034 (#73), **amended on 21 Nov for the business In transit location**, built first.
- ADR 0030 (#68, Farhan) for approvals, plus the kind `transfer_write_off`; ADR 0013 (#39) for posting, plus the
  `inter_branch` role added to ADR 0012's role list (#38).
- ADR 0011 (#37) idempotency; ADR 0032 (#71) activity record; ADR 0045 (#87) for the mismatch item.

## Size and PR split

| Part | Contents                                                                    | Size |
| ---- | --------------------------------------------------------------------------- | ---- |
| 1    | tables, request, approval, send; tests 1 to 3, 8 (send), 10                 | ~400 |
| 2    | receive, write-off, journals, mismatch source; tests 4 to 7, 8 (receive), 9 | ~400 |
| 3    | Transfers tab and the I-09 end-to-end test (11)                             | ~300 |

## Consequences

- **Easier:** every unit is always somewhere on the ledger, including on the road; each branch confirms its own
  side; a shortage can't disappear.
- **Harder:** one location without a branch, which ADR 0021's tables and RLS must allow in exactly one, checked
  way.
- **Undo:** before go-live, drop the two tables in a new migration; the `inter_branch` role stays harmless.

## Open questions

1. ~~**Munif:** who can confirm a receive, when it writes to both branches?~~ **Decided by Munif, 21 Nov:** a user
   whose scope covers both branches. **Now the fallback only:** question 4's design lets the receiving branch
   confirm its own receipt.
2. ~~**Munif:** a move between two locations of the same branch?~~ **Decided by Munif, 21 Nov:** a plain move, one
   step, no approval and no journal (`kind = 'relocation'`), with its activity event.
3. ~~**Both:** one `inter_branch` account per business, or one per pair of branches?~~ **Decided by Munif, 21
   Nov:** one account per business; each journal's `branch_id` says which branch owes.
4. ~~**Munif:** one In transit location per business, outside every branch, so each branch writes only its own
   side?~~ **Decided by Munif, 21 Nov:** yes, this is the chosen design (the flow above); question 1's
   both-branches user stays as the fallback. ADR 0034 (#73) and ADR 0021 (#59) are amended to match.
   - **Why it works:** with a location that belongs to a branch, one of the two steps always writes that branch's
     rows. A location of the business, not of a branch, lets the send write only the sending branch plus In
     transit, and the receive only the receiving branch plus In transit.

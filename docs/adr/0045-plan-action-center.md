# 0045: Plan for the Action Center: exceptions, assign, due date, resolve, history (F3)

| Field               | Value                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| Status              | Proposed                                                                                                        |
| Date                | 2026-11-21                                                                                                      |
| Deciders            | Munif, Farhan                                                                                                   |
| Owner               | Munif (Report owns `action_item`); each module owner writes its exception source                                |
| Spec / roadmap refs | spec D-04, D-05, C-17; CLAUDE.md "Open/closed", tenancy rules; ADR 0012, 0030, 0033, 0041, 0042, 0044; plan 2.4 |

## Context

- **D-04:** each exception shows what happened, the amount, the source document and an owner; it can be assigned
  with a due date and resolved, and its history is kept.
- **D-05**, the minimum list: unreconciled collection, sold but not delivered, overdue customer payment, aged
  stock, transfer mismatch, pending approval, low stock, overdue registration, supplier bill due.
- Plan 2.4: the list is **derived** (each module's read query, always current, no worker); a row is **stored only
  when someone acts** on an item.

New tenant tables and a contract every module implements, so CLAUDE.md requires an agreed plan. No code is in this
PR.

## Decision

### 1. Exception sources (one class per kind, open/closed)

Each module provides `IExceptionSource` implementations, one per kind, registered in `createManagers`:

```ts
interface IExceptionSource {
  kind: ExceptionKind; // e.g. 'low_stock'
  permission: PermissionCode; // who may see this kind
  list(scope: TenantScope): Promise<ExceptionRow[]>;
}
// ExceptionRow: { kind, sourceType, sourceId, branchId | null, summary (i18n key + values),
//                 amount: Money | null, since: Date, link: { route, id } }
```

| Kind (D-05)                | Source (owner)                          | Condition                                    |
| -------------------------- | --------------------------------------- | -------------------------------------------- |
| `unreconciled_collection`  | Accounting, day close (Munif, ADR 0017) | a collection not matched at day close        |
| `sold_not_delivered`       | Sales (Farhan)                          | invoiced, not delivered after N days         |
| `overdue_customer_payment` | Sales or Party dues (Farhan, ADR 0026)  | a due past its date                          |
| `aged_stock`               | Inventory (Munif)                       | units older than the business's age setting  |
| `transfer_mismatch`        | Inventory (Munif, ADR 0041)             | a `received_short` transfer still unresolved |
| `pending_approval`         | Approvals (Farhan, ADR 0030)            | a pending request the caller may decide      |
| `low_stock`                | Inventory (Munif, ADR 0042)             | Low or Out by the reorder rule               |
| `overdue_registration`     | Vehicle pack (Munif)                    | a sold unit not registered within N days     |
| `supplier_bill_due`        | Purchase (Farhan, ADR 0028)             | a bill due within N days or overdue          |

- A new kind is a new class, never a `switch` branch (CLAUDE.md). Pack kinds (`overdue_registration`) register
  only when the pack is on (spec O-11).
- `GET /v1/action-center` runs the sources the caller may see, for the active scope, and joins each row to its
  stored state (below). Amounts pass through ADR 0033's redaction.
- **Speed (C-17, 2 seconds):** each source is one indexed query; they run in the request's one transaction, one
  after another (one connection). The response has counts per kind and the first 50 rows by `since`; a kind's
  tab pages through that source alone.

### 2. Stored state (Report, migration `action_items`)

| Table               | Columns and notes                                                                                                                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `action_item`       | `kind`, `source_type`, `source_id`, `branch_id` (null when business-level), `assignee_id`, `due_date`, `status` (`open`, `resolved`), `resolved_at`, `version`; unique on `(business_id, kind, source_type, source_id)` |
| `action_item_event` | append-only history: `action` (`assign`, `set_due`, `resolve`, `reopen`, `comment`), `before`, `after`, `note`, `created_by`, `created_at`                                                                              |

- The first action on a derived row creates its `action_item` with `INSERT … ON CONFLICT DO NOTHING`, so two people
  acting at once share one item. Later changes are `UPDATE … WHERE version = $read` (`version.stale`).
- **Every change writes one `action_item_event` in the same transaction.** Assigning someone else also writes their
  notification (ADR 0044).
- The assignee must be a user of the same business with access to the item's branch, or `400`
  (`action_item.assignee_not_allowed`).
- The rules on #27 and #31 apply; `action_item_event` is append-only (`SELECT, INSERT` only).

### 3. When is an item done? (question 1)

- **Resolving hides the item until its condition starts again.** Each source returns `since` (when the condition
  began); a resolved item reappears when the source returns it with `since > resolved_at`, as a fresh occurrence,
  and the history shows both.
- **If the condition clears by itself** (the stock arrives, the customer pays), the item simply stops appearing.
  Its stored row, if any, stays with its history.

### Routes and permissions

| Route                                                                                                                        | Permission                                        |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `GET /v1/action-center`, `GET …/items/:kind/:sourceId`                                                                       | `report.action_center.view`, plus each kind's own |
| `POST /v1/action-center/items` (first action), `POST …/items/:id/assign`, `…/due-date`, `…/resolve`, `…/reopen`, `…/comment` | `report.action_center.act`                        |

Default mapping: Owner, Business Manager, Branch Manager act; Accountant views; Cashier none.

## Invariants touched

Tenancy (business- and branch-scoped items; each source runs under the caller's RLS), hidden fields (amounts
redacted), append-only history (#27), notifications in the same transaction (invariant 10 via ADR 0044).

## Tests to write first

1. With a seeded exception of each kind, the list shows all nine for an Owner; a Branch Manager of branch 2 sees
   none of branch 1's; a role without a kind's permission doesn't see that kind or its count.
2. The first action creates exactly one `action_item`, even when two users act at once.
3. Assign, due date, resolve and reopen each write one history row with before and after; a stale version gets
   `version.stale`.
4. A resolved low-stock item stays hidden while the same Low continues, and reappears when the item recovers and
   goes Low again (new `since`).
5. An item whose condition clears disappears from the list; its history remains readable.
6. Assigning someone outside the item's branch is refused; assigning writes the assignee's notification.
7. Amounts are absent for roles without the hidden-field permission (ADR 0033).
8. Isolation: business Y sees no items, counts or history of X, and can't act on X's ids.
9. Speed: with 10,000 rows per source in a seeded database, the first page returns within 2 seconds (C-17).

## Dependencies

- ADR 0044 (notifications), ADR 0033 (#72, permissions and redaction), ADR 0012 (#38, contract list).
- Each source's own feature: 0041 (#83), 0042 (#84), 0030 (#68), 0026 (#64), 0028 (#66), 0017 (#44), the Vehicle
  pack. **The Action Center ships with the sources that exist**; each later source is one class in its owner's PR.

## Size and PR split

| Part | Contents                                                                              | Size     |
| ---- | ------------------------------------------------------------------------------------- | -------- |
| 1    | `IExceptionSource`, the list route, the two tables, the actions; tests 1 to 3, 5 to 8 | ~400     |
| 2    | the recurrence rule and the speed test; tests 4 and 9                                 | ~200     |
| —    | one source class per kind, in each owner's feature PR                                 | ~60 each |

## Consequences

- **Easier:** a new exception is one class; the list is never stale because nothing is cached.
- **Harder:** the list's speed depends on every source's query; each source PR adds its index and a timing test.
- **Undo:** before go-live, drop the two tables; the sources are read-only.

## Open questions (with recommended answers)

1. **Munif:** when a resolved item's condition is still true, hide it until the condition starts again, or show it
   again on the next day? **Recommended:** hide until it starts again (section 3); a "resolve" means "dealt with".
2. **Munif:** the thresholds (N days for not delivered, registration, bill due; the stock age): fixed defaults or
   per-business settings? **Recommended:** per-business settings with defaults (3 days, 15 days, 7 days, 180
   days), stored with the business's other settings.
3. **Farhan:** do `sold_not_delivered`, `overdue_customer_payment`, `supplier_bill_due` and `pending_approval` fit
   `ExceptionRow`, or does any need another field? **Recommended:** they fit; `summary` carries the specifics.

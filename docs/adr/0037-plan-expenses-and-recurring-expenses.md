# 0037: Plan for expenses and recurring expenses (D8)

| Field               | Value                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| Status              | Proposed                                                                                                 |
| Date                | 2026-11-21                                                                                               |
| Deciders            | Munif, Farhan                                                                                            |
| Owner               | Munif (Accounting; plan row D8)                                                                          |
| Spec / roadmap refs | spec A-08, A-23; CLAUDE.md invariants 1, 4, 5, 9; ADR 0013, 0015, 0016, 0017, 0030, 0035; plan 3.3, 6 Q6 |

## Context

**A-08 and A-23:** an expense is recorded with its receipt, approved above a limit, and posted to the books.

**Moto Mart (plan Q6):** recurring expenses (rent) **never post by themselves**. On the due day they're a
reminder, and a person pays them as a normal expense (plan 3.3).

This is a ledger and migration change, so CLAUDE.md requires an agreed plan. No code is in this PR.

## Decision

### Tables (Accounting, migration `expenses`)

**`expense`** (branch-scoped):

| Column                   | Notes                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------- |
| `number`                 | from `INumberSeries.next('expense', branchId)` (ADR 0015)                               |
| `expense_date`           | business date, Asia/Dhaka                                                               |
| `account_id`             | an `expense`-type account (checked)                                                     |
| `amount`                 | `numeric(18,2)`, above zero                                                             |
| `method`, `external_ref` | as ADR 0016: `cash`, `bank`, `bkash`, `card`; the reference is required except for cash |
| `payee`                  | text; `party_id` optional (a supplier)                                                  |
| `status`                 | `pending_approval`, `posted`, `voided`                                                  |
| `journal_id`             | set when posted                                                                         |
| `receipt_attachment_id`  | nullable until attachments exist (B13, B14)                                             |

**`recurring_expense`**: `branch_id`, `account_id`, `label`, `amount`, `due_day`, `starts_on`, `ends_on`,
`is_active`.

The rules on #27 and #31 apply to both.

### Flow

1. **Record** (`POST /v1/expenses`, idempotent, ADR 0011). If `IApprovalService.needs('expense', amount)` (ADR
   0030), save it as `pending_approval` and post nothing. Otherwise post at once.
2. **Post:** `PostingService.post`, Dr the expense account, Cr the method's role (`cash`, `bank`, `mobile_money`,
   `card_clearing`). Then `status = posted` with `journal_id`, in one transaction (invariant 4).
3. **Approve** (by another user): posts as in step 2. **Void:** a reversal journal and `voided`, never a delete.
4. **Recurring:** nothing posts automatically. On the due day a reminder lists it ("Rent due"). The Action Center
   (F3) shows it later; until then, the expenses list does. Paying it opens a prefilled expense.

## Invariants touched

1 and 4 (a balanced journal in the same transaction), 5 (idempotent), 9 (date not in a closed day or locked
month), and permissions (the creator can't approve).

## Tests to write first

1. An expense below the limit posts at once: Dr expense, Cr cash, balanced; `journal_id` is set.
2. Above the limit, it's `pending_approval` with no journal; approval by another user posts once; the creator is
   refused.
3. A non-`expense` account is refused; bank, bKash and card need `external_ref`; cash doesn't.
4. A void posts a reversal, and the expense keeps its number.
5. An expense dated in a closed day or locked month is refused.
6. A recurring expense never creates an expense or a journal by itself; its reminder appears on the due day.
7. The same `Idempotency-Key` twice gives one expense; isolation for every route.

## Dependencies

- ADR 0013 (#39), ADR 0015 (#41), ADR 0016 (#43, the method roles), ADR 0030 (#68, Farhan), ADR 0017 (#44),
  ADR 0035, ADR 0011 (#37), ADR 0033.
- B13 and B14 for receipt files (batch 4).

## Size and PR split

| Part | Contents                                                | Size |
| ---- | ------------------------------------------------------- | ---- |
| 1    | `expense`, record, post, approve, void, tests 1 to 5, 7 | ~400 |
| 2    | `recurring_expense`, the reminder list, test 6          | ~250 |

## Consequences

- **Easier:** every taka spent is in the books with who approved it.
- **Harder:** a receipt photo waits for attachments.
- **Undo:** before go-live, drop the tables in a new migration.

## Open questions (with recommended answers)

1. **Munif:** what is the approval limit for an expense? Recommended: a per-business rule (ADR 0030); default
   ৳10,000.00, to confirm with the owner.
2. **Munif:** payee as free text, with an optional supplier? Recommended: yes.
3. **Munif:** must a receipt be attached once attachments exist? Recommended: required above the approval limit
   only.

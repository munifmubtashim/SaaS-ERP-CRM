# 0036: Plan for the chart of accounts screens and manual journals with approval (D7)

| Field               | Value                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------- |
| Status              | Proposed                                                                                 |
| Date                | 2026-11-21                                                                               |
| Deciders            | Munif, Farhan                                                                            |
| Owner               | Munif (Accounting; plan row D7)                                                          |
| Spec / roadmap refs | spec A-16, A-17, U-05; CLAUDE.md invariants 1, 2; ADR 0013 (#39), 0030 (#68), 0033, 0035 |

## Context

- **ADR 0013 (#39)** creates `account`, `account_role` and journals, and posts journals only through
  `PostingService`. It has no screens.
- **A-16:** the Accountant manages the chart of accounts.
- **A-17:** a manual journal needs an approval, and nobody may approve their own (U-05; Farhan's approvals plan,
  ADR 0030, #68).

Journals are posted on insert, so a manual journal waiting for approval needs its own draft table. That's a ledger
and migration change, so CLAUDE.md requires an agreed plan. No code is in this PR.

## Decision

### Chart of accounts screens

- **Routes:**
  - `GET /v1/accounts` (tree);
  - `POST /v1/accounts`;
  - `PATCH /v1/accounts/:id` (name, Bangla name, archive), with the version check;
  - `GET` and `PUT /v1/account-roles` (the role → account mapping, ADR 0012).
- **Rules:**
  - The code is unique per business.
  - An account's `type` can't change once it has a line.
  - An archived account takes no new lines (ADR 0013 trigger).
  - Pass-through roles map only to liabilities (ADR 0013).
- **Permissions** (ADR 0033): `accounting.account.view`, `accounting.account.edit`.

### Manual journals

**Tables** (Accounting, migration `manual_journal`):

| Table                       | Notes                                                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `manual_journal_draft`      | `branch_id`, `journal_date`, `memo`, `status` (`pending`, `posted`, `rejected`), `journal_id` (when posted), `version` |
| `manual_journal_draft_line` | `account_id`, `debit`, `credit`, `party_id`, `memo`                                                                    |

Both are branch-scoped, with the rules on #27 and #31. A draft can be edited only while `pending`, by its creator.

**Flow:**

1. **Submit:** the draft must balance (`sumMoney`), checked before saving. Then `IApprovalService.request`
   (kind `manual_journal`, ADR 0030).
2. **Approve,** by another user with `accounting.journal.approve`. `PostingService.post` with
   `source = { type: 'manual_journal', id: draft.id }` (posted once, ADR 0013), then the draft becomes `posted`
   with `journal_id`, in one transaction.
3. **Reject:** the draft becomes `rejected`; nothing posts.

The approval route is idempotent (ADR 0011). A posted manual journal is corrected only by a reversal (invariant 2).

## Invariants touched

1 (balanced, posted once), 2 (never edited after posting), 9 (date not in a closed day or locked month), and
permissions.

## Tests to write first

1. A pending draft posts nothing; approval posts exactly one balanced journal, and approving twice still gives one.
2. The creator can't approve their own draft (`403`, `approval.self`).
3. An unbalanced draft is refused at submit; a draft with an archived account is refused at posting.
4. A draft dated in a closed day or a locked month is refused at approval (`period.locked`).
5. Rejected drafts never post; a posted draft can't be edited.
6. Account code unique per business; type change refused once the account has a line.
7. Isolation: business Y can't see or approve X's drafts or accounts.

## Dependencies

- ADR 0013 (#39), ADR 0030 (#68, Farhan), ADR 0033, ADR 0035, ADR 0017 (#44).
- ADR 0011 (#37), ADR 0032 (each approval and posting is recorded).

## Size and PR split

| Part | Contents                                            | Size |
| ---- | --------------------------------------------------- | ---- |
| 1    | account routes and screens, tests 6, 7              | ~350 |
| 2    | draft tables, submit, approve, reject, tests 1 to 5 | ~400 |

## Consequences

- **Easier:** the Accountant can fix the books without a developer.
- **Harder:** every manual journal waits for a second person.
- **Undo:** before go-live, drop the draft tables in a new migration.

## Open questions (with recommended answers)

1. **Munif:** does every manual journal need approval, or only above an amount? Recommended: every one in release
   1 (an ADR 0030 rule with no threshold).
2. **Munif:** who approves? Recommended: Owner and Accountant.
3. **Munif:** may the Accountant edit the role → account mapping, or only the Owner? Recommended: Owner and
   Accountant, every change recorded (ADR 0032).

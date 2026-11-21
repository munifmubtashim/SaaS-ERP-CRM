# 0030: Plan for B7 and B8, approvals

| Field               | Value                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| Status              | Proposed                                                                                                 |
| Date                | 2026-11-21                                                                                               |
| Deciders            | Farhan (owner), Munif                                                                                    |
| Spec / roadmap refs | spec U-05, S-05, S-11, S-12, PU-08, A-08, A-17, I-07, I-09; ADR 0005, 0008, 0011, 0012; plan 2.6, B7, B8 |

## Context

The plan lists B7, "approvals", as an ADR first (plan 2.6; it reserved 0013, which went to the journal engine),
and B8 as the build: `approval_rule`, `approval_request`, and the self-approval check. ADR 0012 (#38) names
`IApprovalService` with Platform (Farhan) as provider. Several plans wait on it:

| Kind                           | Waiting plan                    |
| ------------------------------ | ------------------------------- |
| `discount`                     | C12 (ADR 0022 leaves it out)    |
| `delivery_with_balance`        | C12                             |
| `credit_over_limit`            | C17 (ADR 0024, #62, question 2) |
| `overdue_credit_sale`          | C17 (ADR 0024, question 3)      |
| `purchase_order`               | D2 (ADR 0028, #66, question 5)  |
| `expense`, `manual_journal`    | Accounting (Munif)              |
| `stock_adjustment`, `transfer` | Inventory C6, C7 (Munif)        |
| `return`                       | C14                             |

This plan touches permissions, a tenant table and migrations, so CLAUDE.md requires it before code. No code is
in this PR.

## Decision

### 1. Two modes, one table

- **Pending:** the document waits in a status until someone approves it; then the consumer finishes it.
- **Counter override:** at the POS, a manager signs in on the cashier's screen and approves on the spot. It is
  still a separate user with their own session, so self-approval stays impossible.
- **Build pending first** (plan 2.6). Counter override needs a second sign-in in the same browser and waits for
  the session ADR (0018, #45). Open question 2.

### 2. Tables (Platform, `platform.prisma`, migration `approvals`)

**`approval_rule`** (business-level):

| Column                | Notes                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| `business_id`, `kind` | one active rule per business and kind (partial unique)                                                |
| `threshold`           | `numeric(18,2)`; null = every request of that kind needs approval                                     |
| `approver_permission` | a permission code from `permissions.ts`, for example `sales.discount.approve`                         |
| `is_active`           | rules are replaced, not edited: a new row, the old one inactive; a trigger allows only `true → false` |

**`approval_request`** (branch-scoped):

| Column                               | Notes                                                                                               |
| ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `branch_id`                          | the document's branch                                                                               |
| `kind`, `subject_type`, `subject_id` | what is waiting; unique on `(business_id, kind, subject_type, subject_id) WHERE status = 'pending'` |
| `amount`                             | `numeric(18,2)`, nullable                                                                           |
| `reason`                             | why it was asked, 1 to 500 characters                                                               |
| `requested_by`                       | the caller                                                                                          |
| `status`                             | `pending`, `approved`, `rejected`, `withdrawn`                                                      |
| `decided_by`, `decided_at`           | null while pending                                                                                  |
| `decision_note`                      | optional                                                                                            |
| `rule_snapshot`                      | `jsonb`: the rule's threshold and permission at request time (B8's test)                            |

- **No self-approval (U-05), in the database too:** `CHECK (decided_by IS NULL OR decided_by <> requested_by)`.
  The Manager checks it first and answers `403 FORBIDDEN`, field code `approval.self`.
- **A decision is final:** a trigger allows only `pending → approved`, `pending → rejected` and
  `pending → withdrawn` (the requester only), with `decided_by` and `decided_at`.
- **RLS and grants** as every tenant table (ADR 0008, #27): forced; `approval_request` branch-scoped with
  `branch_is_active`; `erp_app` `TO erp_app` with `UPDATE` only on the decision columns and `status`; owner
  policies `TO CURRENT_USER` for `SELECT`, `INSERT`, `UPDATE`; no `DELETE` for any role; `BEFORE TRUNCATE`
  triggers.

### 3. The service (`IApprovalService`, ADR 0012)

```ts
interface IApprovalService {
  /** Is approval needed for this kind and amount, under the business's active rule? */
  needs(kind: ApprovalKind, amount: Money | null): Promise<boolean>;
  /** Opens a pending request; idempotent per subject. */
  request(input: {
    kind: ApprovalKind;
    subject: { type: string; id: string };
    amount: Money | null;
    reason: string;
  }): Promise<{ requestId: string }>;
  /** True when the subject has an approved request of that kind. */
  isApproved(
    kind: ApprovalKind,
    subject: { type: string; id: string },
  ): Promise<boolean>;
}
```

- **Each kind is a class behind `IApprovalPolicy`** (CLAUDE.md open/closed): the policy names the subject type
  and how the consumer finishes the document after approval. A new kind is a new class, never a `switch` branch.
- Everything runs in the caller's request transaction (ADR 0005): a document and its request commit together.
- **Deciding** is `POST /v1/approvals/:id/approve` or `…/reject`, `{ idempotent: true }`. It checks the caller
  holds the request's snapshot permission, isn't the requester, and is in scope for the request's branch. The
  approval itself changes no document; the consumer's own route finishes it (open question 3).

### 4. Routes (all `scope: 'tenant'`, each with an isolation case)

| Route                                 | Permission                                                   |
| ------------------------------------- | ------------------------------------------------------------ |
| `GET /v1/approvals?status=pending`    | any `*.approve` code; lists only kinds the caller may decide |
| `GET /v1/approvals/:id`               | the requester, or a holder of its permission                 |
| `POST /v1/approvals/:id/approve`      | the snapshot permission                                      |
| `POST /v1/approvals/:id/reject`       | the snapshot permission                                      |
| `POST /v1/approvals/:id/withdraw`     | the requester                                                |
| `GET`, `PUT /v1/approval-rules/:kind` | `platform.approval_rule.manage` (Owner, Business Manager)    |

Pending approvals feed the Action Center (plan 2.4).

## Tests to write first (run to see them fail)

businessLogic, with fakes:

1. No active rule: `needs` is false. A threshold of ৳5,000.00: ৳5,000.00 doesn't need approval, ৳5,000.01 does.
   A null threshold: every request needs it.
2. The requester can't approve their own request (`approval.self`), even with the permission.
3. A caller without the snapshot permission gets 403; changing the rule later doesn't change who may decide an
   old request (the snapshot).

Real Postgres:

4. The `CHECK` refuses `decided_by = requested_by` even when the Manager is skipped, as the owner too.
5. A decided request can't change again (trigger); `withdrawn` is the requester's only.
6. A second pending request for the same subject and kind is refused by the partial unique index.
7. Two approvers deciding at once: one decision stands, the other gets 409.
8. Isolation: business Y gets 404 on X's requests and rules by id; a branch-2-only manager can't decide a branch-1
   request.
9. As the owner (no superuser, no `BYPASSRLS`), a `DELETE` removes 0 rows; `TRUNCATE` is refused. Tests check only
   their own fresh ids.

## Migration steps (written here, applied in the PR, not now)

1. Merge `main`; tell Munif `approvals` is in flight (`platform.prisma` is shared with idempotency, ADR 0014).
2. Add `ApprovalRule` and `ApprovalRequest` to `platform.prisma`; back-relations on `Branch`.
3. `npm run db:migrate:new -- approvals`; append RLS, owner policies, the `CHECK`, the partial unique index, the
   decision trigger and the `TRUNCATE` triggers; read every statement.
4. `npm run db:migrate:check`, `db:migrate:deploy` on a throwaway Postgres, `test:integration`, `test:isolation`.

## Size and PR split

| Part | Branch                | Contents                                                        | Size (approx.) | Needs first                 |
| ---- | --------------------- | --------------------------------------------------------------- | -------------- | --------------------------- |
| 1    | `feat/approval-codes` | `ApprovalKind`, permission codes, shared payloads (both review) | ~150           | this ADR, #26               |
| 2    | `feat/approvals`      | migration, Query, `ApprovalService`, routes, tests 1–9          | ~400           | part 1, ADR 0014 part 1, A6 |
| 3    | each consumer's PR    | its `IApprovalPolicy` class (C12, C17, D2, …)                   | ~100 each      | part 2                      |

## Blocked by

- ADR 0012 (#38) for the interface; ADR 0014 (#40) part 1 for `platform.prisma`; A6 and A5 for the caller and
  scope; #26 for permission codes.

## Consequences

- **Easier:** every "needs approval" rule in the plans is one table and one class per kind.
- **Harder:** documents that wait gain a waiting status and a finish step in their own module.
- **Keep true:** nobody approves their own request, in the Manager and in the database; a decision is final.
- **Undo:** before go-live, drop both tables in a new migration; consumers fall back to their release-1 rules.

## Open questions for Munif

1. **Kinds in release 1:** `credit_over_limit`, `purchase_order` and `discount` first? Recommended: yes; the rest
   come with their features.
2. **Counter override:** after the session ADR (#45), as a second short-lived session for the approver?
   Recommended: yes, not in B8.
3. **Who finishes the document:** the consumer's own route after approval, not the approval route? Recommended:
   yes, so each module keeps its own posting rules.
4. **Expiry of pending requests:** none in release 1, listed in the Action Center by age? Recommended: yes.

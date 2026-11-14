---
name: review-money-paths
description: Read-only review of the current branch's diff against the money, stock and tenancy invariants. Use when the developer runs /review-money-paths before opening or approving a PR.
argument-hint: '[base-ref, default origin/main]'
disable-model-invocation: true
---

# /review-money-paths

Read-only. **Do not edit any file.** Report findings; the developer decides what to fix.
This is an extra check. It never replaces the other developer's review.

## 1. Collect the diff

```bash
git fetch origin
git diff --stat ${ARGUMENTS:-origin/main}...HEAD
git diff ${ARGUMENTS:-origin/main}...HEAD
```

Focus on files touching: journals, accounts, payments, invoices, stock movements, balances, reservations,
transfers, adjustments, period lock, permissions, RLS, migrations, `SET LOCAL`, idempotency.

## 2. Check each invariant (CLAUDE.md, roadmap 4.2 and 4.3)

For every item answer **OK / VIOLATION / NOT TOUCHED**, with `file:line` evidence.

1. Money: no `number`/float arithmetic on money; `numeric(18,2)` in SQL; strings in API payloads; shared money helpers only.
2. Journals balance: every posting produces `sum(debit) = sum(credit)`; a test proves it against real Postgres.
3. Immutability: no UPDATE or DELETE of posted journals, journal lines or stock movements; corrections are reversals linked to the original.
4. Stock: on-hand derived from movements; decrements use `SELECT ... FOR UPDATE` or conditional `UPDATE`; no read-then-write; negative stock blocked.
5. One transaction: a source document posts its journal and stock movements in the same transaction.
6. Idempotency: money/stock POSTs honour `Idempotency-Key`; a repeat returns the first result.
7. Tenancy: every query inside a transaction with `SET LOCAL app.organization_id` / `app.business_ids` (never plain `SET`); no business id trusted from the client without an ownership check; new tenant tables have RLS ENABLED and FORCED.
8. Isolation tests: every new tenant route has a case in `packages/backend/src/api/test/isolation/cases.ts`.
9. Pass-through money (BRTA fees, booking advances) posts to liabilities, never revenue.
10. Period lock: no back-dated write into a locked period.
11. Permissions: checked on the API (not only hidden in UI); cost, profit and salary fields filtered for roles without permission.
12. Migrations and layers: no edit to a migration already on `main`; generic core (no vehicle fields outside the Vehicle pack); money and stock rules live in Managers, SQL only in Queries, no layer skipped.
13. Tests: written for the invariants above, including concurrency (two cashiers, double tap) where relevant.

## 3. Report

A table of the 13 checks, then findings ordered by severity (would lose or misstate money or stock, would leak
another business's data, convention). Quote the lines. End with what a human reviewer should read most slowly.

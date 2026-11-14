<!-- Title: Conventional Commit with a module scope, e.g. "feat(sales): partial payment on invoice". One task, one PR. -->

## What and why

<!-- What changed, and the reason. Link the issue, the plan or ADR (docs/adr/), and spec IDs (e.g. S-03, A-12). -->

## Screenshots

<!-- UI changes: English and Bangla, desktop and phone, light and dark. Anonymised data only. Delete if no UI. -->

## Migration notes

<!-- New migration? Name it, say what it does, and whether it is expand or contract. "None" if no schema change. -->

- [ ] No migration, or: merged `main` before creating it, and the other developer knows it is in flight
- [ ] No migration that has reached `main` was edited

## Test evidence

<!-- Paste the commands you ran and their result. -->

```
npm run check
npm run test:integration
```

## Rollback plan

<!-- How to undo this if it breaks: redeploy the previous image; forward-fix migration if the schema changed. -->

## Checklist

- [ ] The author has read every line of this diff, including AI-written code
- [ ] Tests were written from the invariants first; typecheck, lint and tests pass locally
- [ ] Every new API route has an isolation test case (`packages/backend/src/api/test/isolation/cases.ts`), or is on the public allowlist with a reason
- [ ] Docs updated: OpenAPI for API changes, entity list for schema changes, ADR for decisions
- [ ] No real customer data, credentials or `.env` contents in the diff, screenshots or fixtures
- [ ] Core stays generic: no vehicle fields outside the Vehicle pack
- [ ] Layers respected: Controller -> Manager -> Query only; rules in Managers, SQL only in dal

### Money and stock paths (fill in if this PR touches ledger, stock, payments, permissions or tenancy)

- [ ] Money is `numeric(18,2)` in the database and a string in the API; no floats anywhere
- [ ] Posted journals and stock movements are never updated or deleted; corrections are reversals
- [ ] Every journal balances (sum of debits = sum of credits), checked by a test against real Postgres
- [ ] Stock on hand is derived from movements; decrements use `SELECT ... FOR UPDATE` or a conditional update
- [ ] Mutating money or stock endpoints accept an `Idempotency-Key`; a repeat returns the first result
- [ ] Every query runs with business scope inside a transaction that sets `SET LOCAL` tenant values
- [ ] Period lock respected: no back-dated change into a locked period
- [ ] Reviewer: slow, line-by-line review requested

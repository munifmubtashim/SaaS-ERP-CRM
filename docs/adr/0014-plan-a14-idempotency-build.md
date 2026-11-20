# 0014: Plan for A14, building Idempotency-Key

| Field               | Value                                                                         |
| ------------------- | ----------------------------------------------------------------------------- |
| Status              | Proposed                                                                      |
| Date                | 2026-11-21                                                                    |
| Deciders            | Munif, Farhan                                                                 |
| Owner               | **Farhan** (plan row A14)                                                     |
| Spec / roadmap refs | ADR 0011 (the decision), ADR 0005, ADR 0007 (#8, route wrapper); plan A14, §6 |

## Context

ADR 0011 decides how `Idempotency-Key` behaves: claim first, replay on repeat, refuse a reused key, store no
errors. This ADR is the build plan: where each piece goes in the three layers, the tests to write first, the
migration steps and the PR split. It touches a migration and every money route, so CLAUDE.md requires the
plan agreed first. No code is in this PR.

It must merge before A15 (payments, Farhan), which is the first idempotent route.

## Decision

### 1. Where each piece lives

| Layer         | File                                                         | What it does                                                                             |
| ------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| dal           | `prisma/schema/platform.prisma`, migration `idempotency_key` | the table (ADR 0011 section 2), RLS, grants, the "stored once" trigger                   |
| dal           | `sql/rls/idempotency.sql`, `sql/triggers/idempotency.sql`    | raw-SQL source, copied into the migration                                                |
| dal           | `query/IdempotencyQuery.ts`, `dto/IdempotencyDTO.ts`         | `claim(row)`, `find(key)`, `complete(key, status, body)`                                 |
| businessLogic | `contracts/IIdempotencyQuery.ts`                             | what the guard needs from dal                                                            |
| businessLogic | `IdempotencyGuard.ts`                                        | canonical hash, the claim / replay / refuse decision, `complete`                         |
| api           | `controllers/contracts/IIdempotencyGuard.ts`                 | what the wrapper needs from businessLogic                                                |
| api           | `routes/tenantRoute.ts` (#8)                                 | new option `{ idempotent: true }`; reads the header; calls the guard inside `runner.run` |
| api           | `test/unit/idempotentRoutes.test.ts`                         | the route walk (ADR 0011 section 6)                                                      |

The guard is a businessLogic class, not a Manager: it belongs to no module and every module's routes use it.
`createManagers` builds it with the dal Query and returns it next to the Managers, so api still imports only
businessLogic.

### 2. The wrapper, inside the one transaction

```ts
// tenantRoute.ts, sketch only
const { status, body } = await runner.run(tenant, async () => {
  if (!options.idempotent) return handler(req);
  const key = readKey(req); // 400 idempotency.missing when absent or malformed
  const claim = await guard.claim({ key, route, userId, body: req.body });
  if (claim.kind === 'replay') return { ...claim.result, replayed: true };
  const result = await handler(req); // claim.kind === 'claimed'
  await guard.complete(key, result);
  return result;
});
```

- **Refusal:** `guard.claim` throws `409 CONFLICT` with `idempotency.key_reused` when the row exists with
  another hash, route or user.
- **Order:** the claim, the handler's writes and `complete` all commit together, or none of them do.
- **Replay header:** `Idempotent-Replayed: true` is set by the wrapper, after commit, when `replayed` is set.
- **Route string:** `route` is `${req.method} ${req.baseUrl}${req.route.path}`, the pattern, not the
  filled-in URL.

### 3. Canonical hash

`IdempotencyGuard` hashes `JSON.stringify` of the body with object keys sorted at every level, using
`node:crypto` SHA-256. Arrays keep their order. Money is already a string, so no number formatting issue.
Unit-tested: the same body with keys in another order gives the same hash.

### 4. Frontend

Not in A14. The first idempotent screen (Farhan's payment form, A15) adds `postJson(path, body, { key })` to
`HttpClient` and keeps one key per user action, reused on retry.

## Tests to write first (run to see them fail)

**dal, real Postgres (`IdempotencyQuery.int.test.ts`):**

1. `claim` inserts a pending row; a second `claim` with the same key in another connection **waits**, then
   returns the stored row after the first commits.
2. If the first transaction rolls back, the waiting `claim` succeeds as a new claim.
3. `complete` stores status and body once; a second `complete`, or any `UPDATE` of a completed row, fails
   (trigger).
4. `erp_app` can't `DELETE` or `TRUNCATE`.
5. RLS: business Y can't read X's rows; the same key in X and Y are two rows.

**businessLogic, fake Query (`IdempotencyGuard.test.ts`):**

6. Hash ignores key order; any changed value changes it.
7. Stored row with the same hash, route and user → replay; any difference → `idempotency.key_reused`.

**api (`tenantRoute.test.ts`, extended; and an integration test with a test-only route that inserts a row):**

8. The same key twice → one row inserted, identical answers, the second has `Idempotent-Replayed: true`.
9. Two parallel requests with the same key → one row inserted, both answers identical.
10. Missing key on an idempotent route → `400`; on a non-idempotent route → ignored.
11. A handler that throws → no key row remains; the retry runs.
12. The route walk fails for a money or stock route without the option (once ADR 0011 question 2 is answered).

## Migration steps (written here, applied in the PR, not now)

1. Merge `main`; tell Munif `idempotency_key` is in flight. Plan section 6: after `organization_tree`, and
   after `accounting_core` if both are ready the same week.
2. Add the model to `platform.prisma` (new schema file, shared code: both review). Back-relation on
   `business` in `organization.prisma`, one line, reviewed by Munif (plan Q11).
3. `npm run db:migrate:new -- idempotency_key`; append the RLS, grant and trigger SQL; review it.
   - Grants: `SELECT`, `INSERT`, `UPDATE (status_code, response_body)` to `erp_app`.
   - `REVOKE DELETE, TRUNCATE`.
   - RLS enabled and forced, with a policy on `business_id = ANY (app_business_ids())`.
4. `npm run db:migrate:check`; `db:migrate:deploy` locally; `test:integration`; `test:isolation`.

## Size and PR split

| Part | Branch                   | Contents                                                           | Size (approx.) | Needs first                                 |
| ---- | ------------------------ | ------------------------------------------------------------------ | -------------- | ------------------------------------------- |
| 1    | `feat/idempotency`       | migration, SQL, `IdempotencyQuery`, DTO, dal tests 1–5             | ~350           | A3b part 1 (ADR 0009), #29, ADR 0011 agreed |
| 2    | `feat/idempotent-routes` | guard, contracts, wrapper option, tests 6–12 (shared: both review) | ~300           | part 1, #8 merged                           |

## Blocked by

- **ADR 0011** (#37) agreed, including its questions 1 and 2 (error code; how money routes are marked).
- **#8** (the route wrapper) merged, for part 2.
- **A3b part 1** (`business`), ADR 0009 (#31); **`uuid_v7()`** (#29).

## Consequences

- **Easier:** any route becomes safe to retry with one option.
- **Harder:** `tenantRoute.ts` gets a second responsibility. If it grows past these two options, split it into
  steps behind an interface (ADR 0004, open/closed).
- **Keep true:** the claim, the work and the stored response are one transaction.
- **Undo:** before go-live, remove the option and drop the table in a new migration.

## Open questions for Farhan (owner)

1. The guard as a non-module class built by `createManagers`: fine, or should it live under a `platform`
   module with its own Manager?
2. `platform.prisma` as a new schema file for cross-module tables (idempotency now, approvals and outbox
   later), or one file per feature?
3. Test 9 needs two real connections at once. Reuse the tenant test kit from #8 (`tenantTestKit.ts`)?

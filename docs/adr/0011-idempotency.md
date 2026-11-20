# 0011: Idempotency-Key for every money and stock POST

| Field               | Value                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------- |
| Status              | Proposed                                                                                  |
| Date                | 2026-11-21                                                                                |
| Deciders            | Munif, Farhan                                                                             |
| Owner               | **Farhan** (plan row A9; the build is A14, planned in ADR 0014)                           |
| Spec / roadmap refs | CLAUDE.md invariant 5; spec S-20 (the "nothing lost" half); ADR 0005 Q6, Q7; plan 2.7, A9 |

## Context

**The problem.** A cashier taps "Record payment", the network drops, and they tap again. Without protection,
the customer is charged twice and two journals post. Invariant 5 says every POST with money or stock effects
accepts an `Idempotency-Key`, and a repeat returns the first result.

**What is already decided.**

- **ADR 0005 Q6:** the key row is written inside the request transaction, so a rollback removes it.
- **ADR 0005 Q7:** a retry after a lost response returns the first result, because the key row commits with
  the change.
- **Plan 2.7** sketches the table and errors.

This ADR settles the behaviour. ADR 0014 is the build plan: files, tests, migration steps and PR split.

**The numbering moved.** The feature plan reserved 0014 for this ADR. ADRs 0009 and 0010 (#31, #32) took
earlier numbers, so this decision is 0011, and every later planned ADR shifts.

## Decision

### 1. The header

- **Clients send it.** `Idempotency-Key: <value>` on every POST to a route marked `{ idempotent: true }`. The
  value is 1 to 255 visible ASCII characters; the frontend sends a fresh UUID per user action (one per form
  submit, reused on retry).
- **Missing key:** `400 VALIDATION_FAILED`, field `Idempotency-Key`, code `idempotency.missing`.
- **Routes that need it:** every route whose effect moves money or stock (payments, invoices, receipts,
  adjustments, transfers, journals). The route wrapper (ADR 0007, #8) applies it from the route option.

### 2. The record

One row per (business, key), in the tenant tree:

| Column          | Type          | Notes                                                                      |
| --------------- | ------------- | -------------------------------------------------------------------------- |
| `id`            | uuid          | `uuid_v7()` default                                                        |
| `business_id`   | uuid          | the active business of the request (ADR 0007); RLS on it                   |
| `key`           | text          | the header value                                                           |
| `user_id`       | uuid          | who sent it; a different user with the same key is refused                 |
| `route`         | text          | method and route pattern, e.g. `POST /v1/payments`, not the filled-in path |
| `request_hash`  | bytea         | SHA-256 of the canonical JSON body (keys sorted), computed in the api      |
| `status_code`   | int, nullable | null while the first request is still running                              |
| `response_body` | jsonb         | the body that was sent, stored when the handler finishes                   |
| `created_at`    | timestamptz   |                                                                            |

Unique on `(business_id, key)`. RLS enabled and forced, like every tenant table.

### 3. The flow, inside the one request transaction (ADR 0005)

1. **Claim first.** Before the handler runs, `INSERT ... ON CONFLICT (business_id, key) DO NOTHING` a row
   with `status_code` null.
2. **If the insert claimed the key:** run the handler. On success, set `status_code` and `response_body` on
   that row, then commit everything together.
3. **If the key was already there:**
   - A request still running in another transaction holds the row. PostgreSQL makes the second insert wait
     on the unique index until the first commits or rolls back.
   - **First committed:** read the stored row. Same user, route and hash → return the stored status and
     body with the header `Idempotent-Replayed: true`. Anything different → refused (section 4).
   - **First rolled back:** its claim is gone, so the second insert succeeds and the second request runs
     normally.
4. **Errors are not stored.** A handler that throws rolls the transaction back, claim included, so a retry
   runs again. A stored response is always a success.

Claiming first means at most one handler does the work, even when two identical requests arrive together.
Writing the row last would let both handlers run; the slower one would hit the conflict only at the end.

### 4. Refusals

| Case                                    | Answer                                              |
| --------------------------------------- | --------------------------------------------------- |
| Same key, different body, route or user | `409 CONFLICT`, field code `idempotency.key_reused` |
| Key from another business               | Not visible (RLS). It's a new key in this business  |

The plan proposed a new code, `IDEMPOTENCY_KEY_REUSED` with 422. This ADR uses the existing `CONFLICT` code
with a field code instead, as the money helpers already do, so `ERROR_CODES` doesn't grow. Open question 1.

### 5. What `erp_app` may do

- `SELECT` and `INSERT`.
- `UPDATE` only on `status_code` and `response_body`, and a trigger refuses any update of a row whose
  `status_code` is already set. A stored response never changes.
- No `DELETE` and no `TRUNCATE`. Old rows are cleaned up later by the worker, as the owner role (deferred,
  ADR 0003). Until then the table grows by one row per money action: small at shop volume.

### 6. Who checks that routes carry it

A test walks every registered tenant route. Any route with a money or stock permission must have
`{ idempotent: true }`. That needs a way to mark a permission code as money or stock, for example a list next
to `PERMISSIONS` in `shared/src/utils/permissions.ts` (#26). Open question 2.

## Tests to write first (detail and order in ADR 0014)

Against real Postgres, through a test-only route that records a row per call:

1. The same key twice in a row → one side effect; the second answer is identical and carries
   `Idempotent-Replayed: true`.
2. The same key twice at the same time → exactly one side effect; both answers identical.
3. The same key with a different body, route or user → `409` with `idempotency.key_reused`; no side effect.
4. A missing key on an idempotent route → `400` with `idempotency.missing`.
5. The handler fails → no key row; a retry with the same key runs and succeeds.
6. Business X cannot see Y's keys; the same key string in X and Y are independent.
7. `erp_app` cannot delete a key row or change a stored response.
8. The route walk: an unmarked money route fails the test.

## Migration

One migration, `idempotency_key`, written and reviewed before it is applied (ADR 0014 has the steps). Plan
section 6 orders it after `organization_tree` (it points at `business`) and after `accounting_core`.

## Consequences

- **Easier:** a retry is always safe, so the POS can show "Try again" after any network error (the release-1
  half of S-20).
- **Harder:** every money route needs the option and the frontend must keep the key across retries of one
  action. The canonical hash means field order doesn't matter, but any change in the body counts as a new
  request.
- **Keep true:** the claim is in the same transaction as the work; a stored response is never edited.
- **Undo:** drop the route option and the table in a new migration. No other table points at it.

## Open questions for Farhan (owner)

1. `409 CONFLICT` with a field code, or a new `IDEMPOTENCY_KEY_REUSED` code with 422, as the plan said?
2. How to mark money and stock permission codes for the route walk: a separate list in `permissions.ts`, or a
   flag on each code?
3. Should a replay also be refused after some age (for example 24 hours), or replay forever until the worker
   cleans up? Recommended: replay while the row exists.
4. Is per-user scoping right? It stops one cashier from replaying another's response with a guessed key, but a
   shared till login would make two people one user.

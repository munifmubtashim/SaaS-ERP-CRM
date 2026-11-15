# 0005: Every tenant request runs in one database transaction

| Field               | Value                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| Status              | **Proposed**                                                                                   |
| Date                | 2026-11-15                                                                                     |
| Deciders            | Munif, Farhan                                                                                  |
| Spec / roadmap refs | roadmap 4.2 (tenancy), 4.3 rule 4 (one transaction per posting); ADR 0001 row 1 (legal entity) |

## Context

Two rules from roadmap 4.2 collide with the way the backend is built today.

1. **Tenancy:** every request runs in one transaction that first sets `app.organization_id` and
   `app.business_ids` transaction-locally, so row-level security (RLS) filters every query. A query outside
   such a transaction must fail.
2. **Layers:** api never imports dal. Managers and Queries receive one shared Prisma client in their
   constructors (`createManagers`). That client is a pool: two calls can land on two different connections,
   and a value set on one connection is invisible to the other, or worse, left behind for the next request.

So someone has to open the transaction, and every Query in the request has to use it without each module
having to remember to.

Hierarchy (ADR 0001 row 1, accepted): Organization > Legal entity > Business > Branch. Legal entities and
businesses are organization-level records; a business belongs to one legal entity. RLS keys on
`business_id` for business-owned tables and on `organization_id` for organization-level tables.

**The tenant scope has no legal-entity id.** Books stay per business, and each business belongs to exactly
one legal entity. So `app.organization_id` and `app.business_ids` are enough, and a legal-entity report
finds its businesses through the `legal_entity` table. If books ever move to the legal-entity level, this
ADR is revisited.

## Decision

**Option B: the route opens the scope, automatically, for every tenant route.**

Request flow for a route with `scope: 'tenant'`:

1. `authMiddleware` identifies the user; `tenantMiddleware` resolves `req.tenant` (organization id and the
   business ids this user may use for this request) and rejects anything else.
2. The tenant route wrapper (api) calls the businessLogic entry point
   `runInTenantScope(req.tenant, () => controller.method(req))`. api still imports only businessLogic.
3. businessLogic asks dal to open **one** Prisma interactive transaction.
4. dal's first statement in it is
   `SELECT set_config('app.organization_id', $1, true), set_config('app.business_ids', $2, true)`.
   `SET LOCAL` takes no bind parameters; `set_config(..., true)` is its parameterised form and ends with the
   transaction, committed or not.
5. dal stores the transaction client in Node's `AsyncLocalStorage` and runs the handler inside it.
6. Controller → Manager → Query run as today. `BaseQuery` takes its client from the AsyncLocalStorage
   context and throws `AppError('INTERNAL_ERROR', 'No tenant scope …')` when there is none. Managers and
   Queries keep their constructors.
7. The Controller **returns** `{ status, body }` instead of writing the response.
8. The handler resolves → the transaction commits → the wrapper sends the response. The handler throws →
   the transaction rolls back → the error reaches `errorMiddleware`. A failed commit is an error response,
   never a 200.
9. Background jobs (when the worker exists) call the same `runInTenantScope` with the job's scope.

Database side: a SQL function per setting (`app_business_ids()`, `app_organization_id()`) **raises an
error** when its value is missing or empty. Policies use it, so an unscoped query errors instead of
returning every row or quietly returning none.

Step 7 is needed because Express 5 does not wait for a handler's promise (router 2.2.0 only attaches a
rejection handler). If Controllers wrote the response themselves, it would leave before the commit.

**Login and public routes.** The identity and access tables are not tenant tables. They are read before a
tenant is known, to log the user in and to build `req.tenant`:

- `user`, `session`, `login_attempt`;
- `membership`;
- the role, permission and user-scope tables.

Only Auth and Health may query without a scope. They do it through a separately named base class,
`UnscopedQuery`, and the lint rule lists `AuthQuery` and `HealthQuery` by name as the only classes allowed
to extend or import it. Health runs `SELECT 1` and reads no table. Membership and scope reads always
filter by the authenticated user's own id, so a user never sees another user's memberships. No
`SECURITY DEFINER` function unless a concrete case needs one.

**Files, PDFs and redirects** are out of scope for this ADR. A tenant route returns JSON. A PDF or export
is produced by a background job, stored in object storage (MinIO), and handed back as JSON with a
short-lived download URL. The download itself never runs inside a tenant transaction. If a route ever has
to stream or redirect, the `{ status, body }` result gets a new variant in its own ADR.

**Proof:** `packages/backend/src/dal/test/TenantScope.int.test.ts` runs against a throwaway RLS table in
its own schema with a spike runner (`test/support/tenantScope.spike.ts`). It shows:

- reads see only the allowed businesses;
- a Query with no scope throws, and SQL with no scope fails in the database;
- the same pooled connection holds no values once the request ends;
- 20 interleaved requests for two businesses never see each other's rows;
- a thrown error rolls back every write.

## Alternatives rejected

**Option A: each Manager opens the transaction.** It works only if every Manager method in 12 modules
remembers to, now and in every later change. One forgotten call means a query on a bare pooled connection.
The tenancy rule is too important to rest on memory and review.

**Option C: one small transaction per query.** It is easy to bolt on, but an invoice must post its journal
and its stock movements in one transaction (roadmap 4.3 rule 4). Per-query transactions break that, and
each query pays for setting the scope again.

## Consequences

- **One connection per request, held for the whole request.** This caps concurrent tenant requests at the
  pool size, per api process. A request that finds no free connection waits up to `maxWait`, then fails
  with 503. Slow work (large exports, PDFs, imports, external calls) must not run inside a tenant request.
  It goes to background jobs, which take their own short scopes.
- **Time limits: PostgreSQL first, Prisma second.** All values are **provisional; measure in Phase 2**.
  - **Primary, set on the `erp_app` role:** `statement_timeout = 5s` and
    `idle_in_transaction_session_timeout = 15s`. A route that needs a different limit (for example a
    report) sets it for its own transaction with `set_config('statement_timeout', …, true)`.
  - Reports and imports will go past the 5 s statement limit. They must override it per route or run as jobs.
  - Checked on PostgreSQL 16.16 as `erp_app`: a transaction-local `statement_timeout` cancels the slow
    statement and resets after the transaction. A transaction-local `idle_in_transaction_session_timeout`
    ends the connection, which the pool then discards.
  - PostgreSQL 16 has no limit on a whole transaction (`transaction_timeout` arrives in 17).
  - **Secondary, in Prisma (`transactionOptions`):** `maxWait` 2 s to get a connection (the default), and
    `timeout` 10 s for the whole request (the default is 5 s), from `DB_TX_TIMEOUT_MS`. On timeout Prisma
    rolls back and returns the connection to the pool; later queries in that request fail.
  - **Pool:** pg `max` 10 per api process (the pg default), from `DB_POOL_MAX`.
- **Empty results skip the database check.** A policy calls `app_business_ids()` once per row. An
  unscoped query that touches no rows (an empty table, or an index lookup that matches nothing) returns
  nothing instead of raising. The risk is low:
  - `BaseQuery` throws before any SQL runs outside a scope, so this only matters for code that bypasses
    `BaseQuery`;
  - an empty result reveals no other business's data;
  - an `INSERT` or `UPDATE` always checks the new row (`WITH CHECK`), so writes still raise.

- **Writes that must survive a failed request** (an audit record of a denied action, a failed-login
  counter) cannot use the request transaction, because it rolls back. They need a separate, explicit path:
  a second short scoped transaction opened after the rollback. It is used only for audit and security
  records, and lint flags it outside them.
- **The mechanism is implicit.** A reader of a Query cannot see where its transaction comes from, so
  CLAUDE.md and `BaseQuery` must say it in plain words. Code outside a scope fails loudly instead of
  working by accident.
- **Prisma upgrade risk.** The current Prisma docs (ORM 8) describe `db.transaction(cb)` with no `timeout`
  or `maxWait` options and recommend PostgreSQL-side timeouts instead. Moving to Prisma 8 removes the
  secondary limits. Then only PostgreSQL limits remain, and capping a whole request needs PostgreSQL 17
  (`transaction_timeout`).
- **Undoing it:** the scope lives in one dal file, one route wrapper and `BaseQuery`. Moving to Option A
  later means calling `runInTenantScope` from Managers instead of the wrapper. No schema change.

## Phase 1 changes (not made yet)

- `dal/config/tenantScope.ts` (new, from the spike): `runInTenantScope`, `currentClient`; export from
  `dal/index.ts`.
- `dal/config/db.ts`: pool `max` and `transactionOptions` from env; remove the TODO.
- `dal/query/BaseQuery.ts`: the client comes from `currentClient()`.
- `dal/query/UnscopedQuery.ts` (new): the injected root client, for `AuthQuery` and `HealthQuery` only.
- `eslint.config.mjs`: a rule that lists `AuthQuery.ts` and `HealthQuery.ts` explicitly as the only files
  that may import `UnscopedQuery`.
- `dal/sql/tenancy.sql`, shipped in the first tenant migration: `app_organization_id()`,
  `app_business_ids()` (both raise when unset), and the `legal_entity` table.
- `businessLogic/src/contracts/ITenantScope.ts` and `createManagers()`: expose `runInTenantScope`.
- `api/routes/tenantRoute.ts` (new): the wrapper from steps 2, 7 and 8. Use it for every route in a
  `scope: 'tenant'` module.
- `api/controllers/BaseController.ts`: `sendJson` becomes a helper that returns `{ status, body }`, and
  Controllers return it.
- `api/middleware/tenantMiddleware.ts`: resolve `req.tenant`; remove the placeholder.
- `docker/postgres/init/01-app-role.sh`, CI and the production role setup: `ALTER ROLE erp_app SET
statement_timeout` and `SET idle_in_transaction_session_timeout`.
- `.env.example`: `DB_POOL_MAX`, `DB_TX_TIMEOUT_MS`.
- Tests:
  - move the proof test onto the real `tenantScope.ts`;
  - api test: a commit failure returns an error, not a 2xx;
  - api test: the response is sent only after the commit;
  - isolation cases per tenant route;
  - Auth test: a user cannot read another user's memberships.
- **CLAUDE.md, once this ADR is accepted:**
  - Tenancy rules: replace "to be designed in a Phase 1 ADR" with "tenant routes run in `runInTenantScope`
    (ADR 0005); Queries get the transaction from `BaseQuery`, never from a constructor".
  - Code standards: "Controllers return `{status, body}`; the route wrapper sends it after the commit".
  - Never do: "no slow work (exports, PDFs, external calls) inside a tenant request".

## Open questions for Farhan

1. Is 10 s enough for your heaviest Sales or Purchase write (an invoice with many lines)? If not, which one
   should move to a job?
2. Audit of denied actions: a second short transaction after the rollback (proposed), or written by the
   worker from a log event?
3. Do you agree that Controllers return `{status, body}` instead of writing the response, across all your
   modules?

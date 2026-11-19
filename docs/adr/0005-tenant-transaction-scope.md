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
Branch-scoped tables filter on `branch_id` as well as `business_id`: spec C-01 requires roles to hold at the
database level, so a Branch Manager or Cashier cannot open another branch's data by changing a URL.
**Party** (customers and suppliers) is business-owned and keyed on `business_id`; details in ADR 0006.

**The tenant scope has no legal-entity id.** Books stay per business, and each business belongs to exactly
one legal entity. So `app.organization_id`, `app.business_ids` and `app.branch_ids` are enough, and a
legal-entity report finds its businesses through the `legal_entity` table. If books ever move to the
legal-entity level, this ADR is revisited.

## Decision

**Option B: the route opens the scope, automatically, for every tenant route.**

Request flow for a route with `scope: 'tenant'`:

1. `authMiddleware` identifies the user; `tenantMiddleware` resolves `req.tenant` (organization id, business
   ids and branch ids this user may use for this request) and rejects anything else.
   - **One active business for writes.** Every route that writes runs with exactly one business: the
     active business the user has chosen (spec O-04). A scope with several businesses is allowed only on
     read-only group routes (for example the owner dashboard), and that transaction runs `READ ONLY`, so
     PostgreSQL itself refuses any write in it.
   - **Read-only is declared, never inferred.** A route is read-only only when it is wrapped with
     `{ readOnly: true }`. It is never inferred from the HTTP method or from the number of businesses. A
     route marked read-only always runs `READ ONLY`, even with one business. A scope with more than one
     business is refused unless the route is marked read-only (as built in #8).
   - **Branches are always explicit.** `app.branch_ids` lists the branches the user may use. For a
     business-wide role it lists every branch of the business; an unset list never means "all branches".
   - **No empty scope.** A scope with no business, or no branch, is rejected before a connection is used,
     like a malformed id.
2. The tenant route wrapper (api) calls the businessLogic entry point
   `runInTenantScope(req.tenant, () => controller.method(req))`. api still imports only businessLogic.
3. businessLogic asks dal to open **one** Prisma interactive transaction. For a route marked
   `{ readOnly: true }` its first statement is `SET TRANSACTION READ ONLY`.
4. dal then sets the three values in one statement:
   `SELECT set_config('app.organization_id', $1, true), set_config('app.business_ids', $2, true), set_config('app.branch_ids', $3, true)`.
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
10. **No scope inside a scope.** `runInTenantScope` called inside a scope rejects with an `AppError` before
    it uses a connection (#4, `551f7da`). A nested call would open a second transaction on another
    connection that commits or rolls back on its own.
11. **No background work started from a request.** Work that outlives the request (a timer, a promise
    nobody awaits) still carries the request's scope in `AsyncLocalStorage`: its `currentClient()` is a
    closed transaction, and its own `runInTenantScope` is refused as nested. Both fail loudly. Such work
    goes to a job.

Database side: a SQL function per setting (`app_organization_id()`, `app_business_ids()`,
`app_branch_ids()`) **raises an error** when its value is missing or empty. Policies use them, so an
unscoped query errors instead of returning every row or quietly returning none. Business-owned tables check
`business_id = ANY (app_business_ids())`; branch-scoped tables also check `branch_id = ANY (app_branch_ids())`.

Step 7 is needed because Express 5 does not wait for a handler's promise (router 2.2.0 only attaches a
rejection handler). If Controllers wrote the response themselves, it would leave before the commit.

**Login and public routes.** The identity and access tables are not tenant tables. They are read before a
tenant is known, to log the user in and to build `req.tenant`:

- `app_user`, `session`, `login_attempt`;
- the role, permission and user-scope tables (`role`, `role_permission`, `permission`, `user_scope`).

There is no `membership` table: a user belongs to one organization (`app_user.organization_id`) and holds
roles through `user_scope` (ADR 0008). These tables have no tenant RLS; the trade-off is in ADR 0008
section 2.

Only Auth and Health may query without a scope. They do it through a separately named base class,
`UnscopedQuery`, and the lint rule lists `AuthQuery` and `HealthQuery` by name as the only classes allowed
to extend or import it. Health runs `SELECT 1` and reads no table. Scope reads always
filter by the authenticated user's own id, so a user never sees another user's scopes. No
`SECURITY DEFINER` function unless a concrete case needs one.

**Files, PDFs and redirects** are out of scope for this ADR. A tenant route returns JSON. A PDF or export
is produced by a background job, stored in object storage (MinIO), and handed back as JSON with a
short-lived download URL. The download itself never runs inside a tenant transaction. If a route ever has
to stream or redirect, the `{ status, body }` result gets a new variant in its own ADR.

**Until the worker exists** (deferred, ADR 0003):

- **Invoices and receipts print from the browser** with a print stylesheet. There is no server-side PDF.
- **Small exports are CSV** from a read-only tenant route, capped at **5,000 rows**. Above the cap the
  route returns a clear error that names the cap and sends no partial file. The CSV text goes out
  through `{ status, body }` with a CSV content type, added when the first export route is built.
- **Large exports and the Mushak 6.3 PDF wait for the worker.** They are not built inside a request.
- **One over-limit error.** The CSV export cap uses the same over-limit error as every other size cap
  (Farhan's proposal on #3): one shared error code, with a message telling the user what to do.

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
  It goes to background jobs, which take their own short scopes. Named job candidates: party merge with a
  long history, large imports, opening balances, purchase receipts with many lines or serial numbers, and
  bulk work.
  - **Until the worker exists** (deferred, ADR 0003), these stay inside the request with a cap on their
    size, set when each is built and checked against the Phase 2 measurements. A request over the cap is
    refused with a clear error, not queued. Each moves to a job when the worker lands.
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

- **Writes that must survive a failed request** (an audit record of a denied action) cannot use the
  request transaction, because it rolls back. They need a separate, explicit path: a second short scoped
  transaction opened after the rollback. It is used only for audit and security records, and lint flags it
  outside them. It opens after the request transaction has ended, so it is not a nested scope. Revisit
  once the worker exists.
- **The failed-login counter is not one of them.** Login is a public route and runs outside any tenant
  transaction. `AuthQuery` (an `UnscopedQuery`) writes each `login_attempt` row in its own statement,
  committed on its own, so a failure later in the same request cannot roll it back.
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
  `app_business_ids()`, `app_branch_ids()` (all raise when unset), and the `legal_entity` table.
- `shared/src/schemas/tenant.schema.ts`: `businessIds` needs at least one id; `branchId?` becomes
  `branchIds` (at least one).
- `dal/config/tenantScope.ts`: set `app.branch_ids`; `SET TRANSACTION READ ONLY` when the route is
  marked `{ readOnly: true }`; refuse several businesses otherwise (#8); reject an empty business list
  (#4) and an empty branch list.
- `businessLogic/src/contracts/ITenantScope.ts` and `createManagers()`: expose `runInTenantScope`.
- `api/routes/tenantRoute.ts` (new): the wrapper from steps 2, 7 and 8. Use it for every route in a
  `scope: 'tenant'` module.
- `api/controllers/BaseController.ts`: `sendJson` becomes a helper that returns `{ status, body }`, and
  Controllers return it.
- `api/middleware/tenantMiddleware.ts`: resolve `req.tenant` with the active business and the allowed
  branches; remove the placeholder. Read-only group routes are marked with `{ readOnly: true }` in the
  route wrapper; only they get several businesses.
- `docker/postgres/init/01-app-role.sh`, CI and the production role setup: `ALTER ROLE erp_app SET
statement_timeout` and `SET idle_in_transaction_session_timeout`.
- `.env.example`: `DB_POOL_MAX`, `DB_TX_TIMEOUT_MS`.
- Tests:
  - move the proof test onto the real `tenantScope.ts`;
  - api test: a commit failure returns an error, not a 2xx;
  - api test: the response is sent only after the commit;
  - isolation cases per tenant route;
  - Auth test: a user cannot read another user's scopes.
- **CLAUDE.md, once this ADR is accepted:**
  - Tenancy rules: replace "to be designed in a Phase 1 ADR" with "tenant routes run in `runInTenantScope`
    (ADR 0005); Queries get the transaction from `BaseQuery`, never from a constructor".
  - Code standards: "Controllers return `{status, body}`; the route wrapper sends it after the commit".
  - Never do: "no slow work (exports, PDFs, external calls) inside a tenant request, and no background
    work started from one".

## Answers (Farhan, 2026-11-16, on PR #3)

1. **Time limit.** 10 s is enough for normal saves (invoices, parties, payments). Party merge with a long
   history, large imports, opening balances, purchase receipts with many lines or serial numbers, and bulk
   work should run as jobs. Until the worker exists they stay in the request with a size cap (see
   Consequences).
2. **Denied-action audit.** A second short transaction after the rollback: a denied action is a security
   record and must not be lost, and the worker does not exist yet. Revisit once it does.
3. **Controllers return `{status, body}`.** Agreed for all modules: the response goes out only after the
   commit.

## Answers to Farhan's review questions (2026-11-16, on PR #3)

Must answer before accepting:

1. **Who owns a Party?** A business: RLS on `business_id`. Details in ADR 0006 (Context).
2. **Active business for writes.** Every write runs with exactly one active business. Several businesses
   only on read-only group routes, in a `READ ONLY` transaction (Decision step 1).
3. **Branch scope.** RLS too: `app.branch_ids` and `app_branch_ids()`; branch-scoped tables filter on it as
   well as `business_id` (Decision step 1, Database side).
4. **Scope inside a scope.** Forbidden, as built in #4 (Decision step 10).
5. **Empty business list** (question 11). Rejected before a connection is used (Decision step 1; fix in #4).
6. **Work that outlives its scope** (question 12). Never start background work inside a request; use a job
   (Decision step 11).

Answered later (settle before the task named):

- **Q5, organization-level tables:** for the slice only `legal_entity` and `business`; Party groups or
  areas are decided in ADR 0006. Before M2.
- **Q6, Idempotency-Key record:** written inside the request transaction, so a rollback removes it. Before F3.
- **Q7, retry after a lost response:** returns the first result, because the key row commits with it.
  Before F3.
- **Q8, shared test helper:** a scoped integration-test helper, taken from the proof test. Before 1b-ii.
- **Q9, longer statement limits:** set per route next to the route definition, with review by both. Before
  the first report route (M6).
- **Q10, Prisma 8:** stay on Prisma 7 until PostgreSQL 17 (`transaction_timeout`) is available; then only
  PostgreSQL limits remain. Before any Prisma major upgrade.

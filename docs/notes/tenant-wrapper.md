# M1, part 1b-ii: the tenant route wrapper

## What was built

ADR 0005 says every tenant request runs in **one** database transaction that has the tenant values set. Part 1a
(PR #4) built the runner that opens that transaction. This part connects it to HTTP:

- **The route wrapper** (`api/routes/tenantRoute.ts`). A route marked `tenant` no longer calls its Controller
  directly. The wrapper opens the tenant transaction for `req.tenant`, runs the Controller inside it, and sends
  the response **only after the transaction has committed**. If the Controller throws, or the commit itself
  fails, the transaction rolls back and the error goes to `errorMiddleware`. A failed commit is never a 2xx.
- **Controllers return `{ status, body }`** instead of writing the response. Express 5 does not wait for an
  async handler, so a Controller that wrote the response itself would answer before the commit.
- **One active business for writes.** A scope with several businesses is refused unless the route is a
  read-only group route. Those run `READ ONLY`, so PostgreSQL itself refuses any write.
- **A shared test helper** (`dal/test/support/tenantTestKit.ts`) so module integration tests can build an RLS
  table and run code in a scope without copying the proof test's setup.

Not yet: the RLS functions, `app.branch_ids`, migrations, and the real `tenantMiddleware` lookup. Until that
lookup exists `req.tenant` is never set, so a tenant route answers 500; no tenant route exists yet.

## Request flow

1. A request reaches `/v1/...`; `authMiddleware` and `tenantMiddleware` run (today both are placeholders).
2. The module's router calls the handler built by `wrap.tenant(...)`.
3. The wrapper checks `req.tenant`. Missing means `tenantMiddleware` did not do its job: `INTERNAL_ERROR`.
4. It calls `tenantScope.run(req.tenant, handler, { readOnly })` through the `ITenantScopeRunner` interface.
5. In dal, `runInTenantScope` rejects a bad scope (non-UUID, no business, several businesses on a write route,
   or a scope inside a scope) before using a connection.
6. It opens one transaction; for a read-only route the first statement is `SET TRANSACTION READ ONLY`.
7. It sets `app.organization_id` and `app.business_ids` with `set_config(..., true)`, then runs the Controller.
8. Controller → Manager → Query; `BaseQuery` takes the transaction from `AsyncLocalStorage`.
9. The Controller returns `{ status, body }`. The transaction commits.
10. Only now does the wrapper call `res.status(status).json(body)`. Any error on the way: rollback, then
    `errorMiddleware` answers with `{ code, message, fields, requestId }`.

## Why each file exists

- `api/routes/tenantRoute.ts`: the wrapper (`tenant` and `public`). The only place a response is sent.
- `api/controllers/BaseController.ts`: `HttpResult` and the `json()` helper Controllers return.
- `api/controllers/HealthController.ts`, `api/routes/HealthRoutes.ts`: the reference slice, now in the new shape.
- `api/controllers/contracts/ITenantScopeRunner.ts`: what the api needs, owned by the api (the consumer).
- `api/app.ts`, `api/server.ts`, `api/routes/index.ts`: pass the runner from `createManagers` to the routes.
- `businessLogic/src/contracts/ITenantScope.ts`, `businessLogic/src/index.ts`: `createManagers` builds the
  runner and returns it, so the api never imports dal.
- `dal/config/tenantScope.ts`: `readOnly`, the one-business rule, and `TenantScopeRunner`.
- `dal/test/support/tenantTestKit.ts`: the shared scoped-test helper; the proof test now uses it.
- `api/test/unit/tenantRoute.test.ts`: order of commit and response, failed commit, errors, missing tenant.
- The 12 module route stubs move to the same shape in a second, stacked PR.

## Five questions an interviewer could ask

1. Why can't the Controller send the response itself, if Express 5 supports async handlers?
2. How do you prove a failed commit never returns 200? What would make that test pass by mistake?
3. Why make multi-business scopes read-only in the database instead of trusting the route code?
4. Why is the runner passed in as an interface instead of the api importing the dal function?
5. What happens to a tenant route today, before `tenantMiddleware` sets `req.tenant`, and why is that safe?

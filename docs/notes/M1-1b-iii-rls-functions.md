# M1, part 1b-iii: RLS policy functions and branch scope

## What was built

Our first real migration. It adds three small SQL functions that every row-level security (RLS) policy will
use to ask "which tenant is this request for?":

- `app_organization_id()` returns the organization of the current request (`uuid`).
- `app_business_ids()` returns the businesses the request may touch (`uuid[]`).
- `app_branch_ids()` returns the branches the request may use (`uuid[]`).

Each one reads a setting that the scope runner put on the transaction. If the setting is missing or empty,
the function **raises an error** instead of returning nothing. That is the point: a query that forgot its
tenant scope must fail loudly, never see every business's rows and never quietly see none.

The scope runner now sets four values instead of two. Beside `app.organization_id` and `app.business_ids` it
sets `app.branch_ids`, the branches the request may use, and `app.branch_id`, the one branch a document is
written to (ADR 0007 step 6).

The shared `TenantScope` type gained a required `branchIds` list with at least one id, and **keeps** the
optional `branchId`, which must be one of `branchIds`. An empty or missing list is rejected before a database
connection is used, because "no branches listed" must never be read as "all branches". When a route has no
write branch, `app.branch_id` is set to `''`, so a pooled connection never carries the previous request's
branch. Nothing reads `app.branch_id` yet; the tenant route wrapper (#8) makes it required on routes marked
`{ branch: 'required' }`.

No tables or policies yet: the first tables that use these functions come with M2 (organization, business,
branch, legal entity).

## Request flow

1. A tenant route enters `runInTenantScope(db, scope, fn)`.
2. The scope is checked with `tenantScopeSchema`: UUIDs only, at least one business, at least one branch,
   and `branchId`, if given, one of `branchIds`.
3. One transaction opens. Its first statement sets `app.organization_id`, `app.business_ids`,
   `app.branch_ids` and `app.branch_id` with `set_config(..., true)`, the parameterised form of `SET LOCAL`.
4. The handler's queries run. A future policy reads the values through the functions, in this form:
   `business_id = ANY ((SELECT app_business_ids())::uuid[])`, and for branch-scoped tables also
   `branch_id = ANY ((SELECT app_branch_ids())::uuid[])`.
   - The `SELECT` wrapper makes PostgreSQL call the function once per query (an InitPlan), not once per row.
     On 200,000 rows that was 14 ms against 224 ms.
   - The `::uuid[]` cast is required: without it, `ANY ((SELECT ...))` is read as "any row of a subquery" and
     fails with `operator does not exist: uuid = uuid[]`.
5. The transaction ends, and the settings end with it. The next request on the same pooled connection gets an
   error from the functions until it sets its own values.

## Why each file exists

- `packages/backend/src/dal/sql/rls/tenancy.sql`: the readable source of the three functions, with the
  policy template in its header. Any change is a new migration with `CREATE OR REPLACE FUNCTION`, plus the
  same edit here.
- `packages/backend/src/dal/prisma/migrations/20261117114224_rls_scope_functions/migration.sql`: the same SQL,
  shipped as a migration so CI and production get exactly what local gets. No schema change, so
  `db:migrate:check` still reports no difference.
- `packages/backend/src/dal/config/tenantScope.ts`: sets `app.branch_ids` and `app.branch_id` (`''` when
  there is none) beside the other two values.
- `packages/shared/src/schemas/tenant.schema.ts`: `branchIds`, required, at least one UUID; `branchId`
  optional, and refused unless it is one of `branchIds`.
- `packages/shared/src/schemas/tenant.schema.test.ts`: the schema accepts a full scope and rejects a missing,
  empty or malformed branch list, and a `branchId` outside the list.
- `packages/backend/src/dal/test/RlsFunctions.int.test.ts`, as the application role against real Postgres:
  each function raises when its value was never set and when it is empty; inside a scope each returns exactly
  what was set; after the scope, the same pooled connection raises again. It also checks that the scope sets
  `app.branch_id` to its `branchId`, and that a scope without one leaves it `''`, never the previous
  request's branch.
- `packages/backend/src/dal/test/TenantScope.int.test.ts`: every scope now lists a branch, plus a test that
  an empty branch list is refused before a transaction opens.
- `packages/backend/src/dal/test/RlsParallel.int.test.ts`: runs the two policy lines straight from
  `tenancy.sql`'s header. It checks the plan has two InitPlans and the count is right, and forces a parallel
  plan in which only worker processes evaluate `app_business_ids()`, proving the workers see the settings.
- `packages/backend/src/dal/test/RlsSqlSource.int.test.ts`: compares each function in `tenancy.sql` with its
  latest definition across the migrations, so the readable source and the database cannot drift apart.

## Design choices

- **Not `SECURITY DEFINER`.** The functions run as the caller and read only the caller's own settings, so they
  need no extra rights.
- **Fixed `search_path`, schema-qualified names.** A schema created by someone else cannot replace
  `current_setting` inside them, and `public.app_...` does not depend on the migration role's search_path.
- **`PARALLEL SAFE`.** Without it, every query under RLS loses parallel plans. It is safe because the
  transaction's settings reach parallel workers, which `RlsParallel.int.test.ts` proves.
- **No `GRANT` in the migration.** The app role's name comes from `APP_DB_USER`, so a migration cannot name
  it; the default `EXECUTE` for everyone is safe because the functions reveal nothing but the caller's own
  settings.

## Five questions an interviewer could ask

1. Why should an unset tenant setting raise an error instead of returning an empty list?
2. Why `set_config(..., true)` and not a plain `SET`? What goes wrong on a pooled connection?
3. An unscoped query on an empty table returns no rows instead of raising. Why is that an acceptable gap?
4. Why are the branch ids always listed explicitly, even for an owner who may use every branch?
5. Why is a function that reads only session settings marked `STABLE`, and what would `VOLATILE` change?

# 0060: GET /v1/me/businesses, the "me" read path

| Field               | Value                                                               |
| ------------------- | ------------------------------------------------------------------- |
| Status              | Proposed (plan agreed by Munif, 26 Nov 2026; needs Farhan's review) |
| Date                | 2026-11-26                                                          |
| Deciders            | Munif, Farhan                                                       |
| Spec / roadmap refs | spec O-04, roadmap 4.2; ADR 0005, 0007 section 2, 0018, 0050, 0051  |

## Context

The business switcher needs the businesses and branches a signed-in user may use, before any business is chosen.
ADR 0007 section 2 planned the route (`GET /v1/me/businesses`, a "user" route that ignores `X-Business-Id`), but the
database could not answer it: `business_app_select` and `branch_app_select` show a row only when its id is already in
`app.business_ids` / `app.branch_ids`. A group Owner has no business ids to set, and a whole-business scope has no
branch ids, so neither could be listed. ADR 0018 and 0005 give no unscoped path that reads these two tables.

## Decision

One migration (`me_businesses`) and the route, under the conditions Munif set on 26 Nov:

1. **Two additive SELECT-only policies for `erp_app`**, `business_app_me_select` and `branch_app_me_select`
   (`dal/sql/rls/me_businesses.sql`), based on the caller's own active `user_scope` rows with an active role and an
   active user:
   - group scope (`business_id` NULL): every business of the organization and all their branches;
   - whole-business scope (`branch_id` NULL): that business and all its branches;
   - branch scope: that business and only that branch.
2. **They apply only on the "me" path**, through `app_me_user_id()` (in `rls/tenancy.sql`, NULL instead of raising,
   like `app_login_key()`). It returns the user only when `app.me_user_id` is set **and** `app.business_ids` and
   `app.branch_ids` are both the nil UUID. Only `AuthQuery.myBusinesses` sets that. A normal tenant transaction sets
   real ids, so the function is NULL and the policies add nothing to it, even if `app.me_user_id` were set too.
   - **Why the nil marker:** the existing policies call `app_business_ids()` / `app_branch_ids()`, which raise when
     unset, and permissive policies are OR-ed, so an unset value would make the "me" read fail. With the nil UUID the
     existing policies run and match no row (ids are uuid_v7; nothing has the nil id). A request naming the nil id in
     `X-Business-Id` gets tenantMiddleware's 404 before any transaction.
3. **Nothing else changes:** not SECURITY DEFINER, `erp_app` stays NOBYPASSRLS, FORCE RLS stays on, the existing
   policies and grants are untouched, every setting is `set_config(..., true)` (SET LOCAL).
4. **The read:** `AuthQuery.myBusinesses(userId, organizationId)`, an `UnscopedQuery` method as its header already
   allows ("the caller's own memberships"), in one short READ ONLY transaction. It returns active businesses with
   their active branches only; a business with no visible active branch is left out (a business always has a
   branch, spec O-01).
5. **The route:** a new route kind `'user'` (ADR 0007 section 2) with `wrap.user`: authMiddleware runs, tenantMiddleware
   does not; no session is a 401. Answer: `{ items: [{ id, name, branches: [{ id, name, shortCode }] }] }`, nothing
   else (no role, no cost). Read-only (GET only). Every `'user'` route needs an isolation case, like a tenant route.

**Tests, written first:** `dal/test/MyBusinesses.int.test.ts` (each scope kind, inactive rows, no scope, org A never
sees org B, a request scoped to X can't read Y even with `app.me_user_id` set, the pooled connection raises after the
read, policies SELECT-only and not SECURITY DEFINER, FORCE kept, the SQL source equals the migration);
`api/test/isolation/me.isolation.test.ts` (HTTP: org A / org B, Business Manager, Cashier, `X-Business-Id` ignored,
401 without a session); `route-coverage.test.ts` (user routes need a case and live under `/v1/me/`).

## Consequences

- **Easier:** the switcher can read real data; the next "me" routes reuse the route kind.
- **Must keep true:** no code other than `AuthQuery.myBusinesses` sets `app.me_user_id`; no tenant transaction ever
  sets the nil marker. A new policy on `business` or `branch` must not depend on `app.me_user_id`.
- **Harder:** two more policies to read when reasoning about `business` and `branch` visibility.
- **Undo:** a new migration that drops the two policies and the function; the route then answers an empty list.

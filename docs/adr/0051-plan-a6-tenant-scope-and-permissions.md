# 0051: Plan for A6, the tenant scope, roles and permission checks from the session

| Field               | Value                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| Status              | Proposed                                                                                             |
| Date                | 2026-11-23                                                                                           |
| Deciders            | Munif, Farhan                                                                                        |
| Owner               | Munif (Auth module; plan row A6)                                                                     |
| Spec / roadmap refs | roadmap 4.2; CLAUDE.md tenancy rules; ADR 0005, 0007 (#16), 0008 (#27), 0009 (#31), 0033 (#72), 0050 |

## Context

Login and sessions exist (ADR 0018, #108 to #114): `authMiddleware` sets `req.auth = { userId, organizationId,
sessionId, roles: [] }`. Nothing yet says **which business** a request works in, **what the caller may do there**,
or checks either. `tenantMiddleware` is still a placeholder that lets every request through, and no tenant route
exists, so nothing leaks today; but no tenant route can be added until this is built.

The rules already decided, which this plan only puts together:

- **ADR 0007 (#16, not yet approved):** the active business arrives in `X-Business-Id` (and `X-Branch-Id` on
  branch-scoped writes); three route kinds (`public`, `user`, `tenant`); "does not exist" and "not a member" are the
  same `404`; refusals happen before the tenant transaction opens.
- **ADR 0008 (#27) and ADR 0009 (#31), approved:** roles are held through `user_scope` (group, business or branch
  scope); only the system Owner holds the whole group; five system roles with the default mapping from #26.
- **ADR 0033 (#72, not yet approved):** every tenant route declares one permission; the route wrapper checks it
  against the caller's roles for the active business and branch; `403 FORBIDDEN` otherwise.
- **ADR 0050:** `user_scope`, `role` and `role_permission` are read only by `AuthQuery`, inside the session's
  organization.

**This plan can't be built until ADR 0007 and ADR 0033 are approved**, because it implements them. It is written
now so the order of work, the files and the tests are agreed together.

## Decision

### 1. What runs on a tenant request, in order

1. `authMiddleware` (ADR 0018): the session gives `userId`, `organizationId`, `sessionId`.
2. **`tenantMiddleware`** (rewritten):
   - parses `X-Business-Id` (one id, or up to 20 on `readOnly` routes) and `X-Branch-Id` with shared Zod schemas;
   - asks `IAuthManager.resolveScope(session, requested)` (new), which asks `AuthQuery.scopesFor(userId,
organizationId)` for the user's active `user_scope` rows **inside the session's organization**
     (`app.organization_id`, ADR 0050), with each row's role code and active permission codes;
   - the Manager decides: a group scope (system Owner) allows every active business of the organization; a business
     scope allows that business and all its active branches; a branch scope allows that branch;
   - any requested business the user can't use, or that doesn't exist: **`404 NOT_FOUND`**, same body, the id never
     repeated (ADR 0007 step 5);
   - sets `req.tenant = { organizationId, businessIds, branchIds, branchId? }` (`tenantScopeSchema`) and fills
     `req.auth.roles` and **`req.auth.permissions`** (the union of the active permissions of the roles that apply to
     the active business and branch).
3. **The tenant route wrapper** (#8) checks the route's options before opening the transaction:
   - `{ permission: '<code>' }` (ADR 0033): **`403 FORBIDDEN`** unless `req.auth.permissions` holds it;
   - `{ readOnly }` and `{ branch: 'required' }` as ADR 0007 says.
4. The transaction opens with `SET LOCAL` values from `req.tenant` (ADR 0005); RLS then enforces the same boundary in
   the database, so a bug above can't widen it.

### 2. The permission check helper (shared, from #26)

- `hasPermission(granted: readonly PermissionCode[], code: PermissionCode): boolean` and
  `permissionsFor(roles, mapping)` in `shared/src/utils/permissions.ts`, next to `PERMISSIONS` and `ROLE_CODES`, so
  the frontend hides the same things the API refuses (CLAUDE.md: permissions come from `shared/src/utils` only).
- **`roleMiddleware`** becomes the wrapper option, not a separate middleware: one place checks, after the scope is
  known. The file is removed.

### 3. Files and layers

| Layer         | Files                                                                                                                                                          |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| shared        | `utils/permissions.ts` (`hasPermission`, `permissionsFor`), `schemas/tenant.schema.ts` (`permissions` on `authContext`)                                        |
| dal           | `query/AuthQuery.ts` (`scopesFor`), `dto/AuthDTO.ts` (`ScopeDTO`)                                                                                              |
| businessLogic | `AuthManager.ts` (`resolveScope`), `contracts/IAuthQuery.ts`                                                                                                   |
| api           | `middleware/tenantMiddleware.ts`, `routes/tenantRoute.ts` (`permission` option), `routes/types.ts` (route kinds), `routes/index.ts`, `test/isolation/cases.ts` |

### 4. Invariants (CLAUDE.md)

- **Tenancy:** no business id is trusted from the client without the membership check; every request still runs in
  one transaction with `SET LOCAL`; ids of other businesses can't be probed (same `404`).
- **Permissions:** checked on the API, never only hidden in the UI; cost, profit and salary stay with ADR 0033's
  redaction, which this plan doesn't build.

## Tests to write first (real Postgres where marked; run to see them fail)

1. **(db)** A user of business X sends `X-Business-Id: Y` (another business of another organization): `404`; of the
   same organization but no scope: `404`; a guessed random id: the same `404`, same body.
2. **(db)** A branch-scoped user sends another branch of the same business: `404`; their own branch: allowed.
3. **(db)** The system Owner with group scope may use every active business of the organization, never another
   organization's.
4. A route with `{ permission: 'report.profit.view' }`: a Cashier gets `403`, an Accountant passes (seeded mapping,
   #116); a deactivated `role_permission` no longer grants it.
5. **(db)** `req.auth.permissions` equals the seeded mapping for each of the five roles (ADR 0008 test 18 through the
   API).
6. Missing, malformed or over-the-cap `X-Business-Id`: `400`; several businesses on a non-`readOnly` route: `400`;
   `{ branch: 'required' }` without `X-Branch-Id`: `400`.
7. Every refusal happens before a transaction opens (the scope runner is never called).
8. **Isolation suite:** every tenant route gets a case in `api/test/isolation/cases.ts` (read, write and guessed id
   for business Y); the route-coverage test also fails for a tenant route without a `permission` option.
9. A pooled connection carries nothing into the next request (ADR 0005, already tested; rerun through the API).

## Size and PR split

| Part | Branch                | Contents                                                                           | Size (approx.) | Needs first                |
| ---- | --------------------- | ---------------------------------------------------------------------------------- | -------------- | -------------------------- |
| 1    | `feat/a6-scope-query` | `AuthQuery.scopesFor`, `ScopeDTO`, `AuthManager.resolveScope`, tests 1–3, 5        | ~350           | ADR 0007 and 0033 approved |
| 2    | `feat/a6-tenant-mw`   | `tenantMiddleware`, route kinds, tests 6, 7, 9                                     | ~300           | part 1                     |
| 3    | `feat/a6-permissions` | `hasPermission`, the wrapper's `permission` option, test 4, test 8's coverage rule | ~250           | part 2                     |

## Consequences

- **Easier:** module routes can be added: the scope, the roles and the permission check come from one place.
- **Harder:** every tenant request reads the user's scopes (one indexed query in the session's organization); cache
  later if it shows.
- **Keep true:** the header never grants access; "missing" and "forbidden" look the same; the permission is
  checked on the API.
- **Undo:** revert the middleware and the wrapper option; no table changes.

## Open questions

1. **Both:** approve ADR 0007 (#16) and ADR 0033 (#72) first, or fold their decisions into this ADR?
2. **Munif:** `req.auth.permissions` for a group-scoped Owner on a multi-business `readOnly` route: the union over
   the listed businesses (recommended) or the intersection?

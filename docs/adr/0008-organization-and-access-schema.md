# 0008: Organization and access schema

| Field               | Value                                                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Status              | **Proposed**                                                                                                            |
| Date                | 2026-11-19                                                                                                              |
| Deciders            | Munif, Farhan                                                                                                           |
| Spec / roadmap refs | spec O-01 to O-10, C-01, U-01 to U-10, D-03; roadmap 4.2 (tenancy); ADR 0001 rows 1 and 8; ADR 0005; ADR 0006; plan 2.1 |

## Context

ADR 0005 fixed how a request enters a tenant scope (`app.organization_id`, `app.business_ids`,
`app.branch_ids`, one transaction, RLS on every tenant table). It did not say which tables the scope
protects. This ADR does, for two groups:

1. **The tenant tree:** organization, legal entity, business, branch (ADR 0001 row 1: books per business,
   each business belongs to one legal entity).
2. **Access:** users, roles, permissions, where a user holds a role, and staff records (spec U-10: people
   with or without a login).

Two things wait on this. Farhan's Party tables reference `business` (ADR 0006), and Munif's `authMiddleware`,
`tenantMiddleware` and `requireRole` are still placeholders that let every request through. CLAUDE.md
requires an agreed plan before any tenancy, permissions or migration code, so this is that plan.

Constraints already decided elsewhere and not reopened here:

- UUID v7 keys, singular `snake_case` table names, `created_at`, `updated_at`, `created_by` on every table.
- RLS **enabled and forced** on every tenant table. The app connects as `erp_app` (not owner, not BYPASSRLS).
- Nothing in this ADR is ever deleted; records are deactivated. `erp_app` must end up with `SELECT, INSERT, UPDATE`
  only, but `docker/postgres/init/01-app-role.sh` grants it `SELECT, INSERT, UPDATE, DELETE` on every new table by
  default privileges, so each migration here revokes `DELETE` explicitly (section 4).
- Login runs outside a tenant scope (ADR 0005, `UnscopedQuery` for Auth and Health only).
- No role sees another organization. Group-wide scope is the Owner role only.

## Decision

### 1. Tables of the tenant tree

| Table          | Level        | Main columns                                                                                                                                                  | RLS key                                |
| -------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `organization` | organization | `id`, `name`, `is_active`                                                                                                                                     | `id = app_organization_id()`           |
| `legal_entity` | organization | `organization_id`, `name`, `bin`, `address`, `is_active`                                                                                                      | `organization_id`                      |
| `business`     | organization | `organization_id`, `legal_entity_id`, `name`, `bin`, `address`, `logo_key`, `invoice_prefix`, `opening_hours` (jsonb), `fiscal_year_start_month`, `is_active` | `organization_id` and `id` (see below) |
| `branch`       | business     | `business_id`, `name`, `address`, `opening_hours`, `is_active`                                                                                                | `business_id` and `branch_id`          |

- `business.legal_entity_id` is `NOT NULL`. A composite key `(organization_id, id)` on `legal_entity` and a
  composite foreign key from `business` makes it impossible for a business to point at another
  organization's legal entity.
- `branch` is the only table here that is branch-scoped: its policy also checks
  `id = ANY ((SELECT app_branch_ids())::uuid[])`.
- **`business` policy:** `USING (organization_id = (SELECT app_organization_id()) AND id = ANY ((SELECT app_business_ids())::uuid[]))`.
  `WITH CHECK` on insert checks only the organization, because the new business is not yet in the caller's
  list. Creating a business needs the Owner permission and is checked in the Manager. The very first
  business of a new organization is created by provisioning (migration or seed, running as owner), not by a
  request.
- **Deactivation:** `is_active = false` keeps history and refuses new writes. Enforcement is two-layered:
  the Manager refuses with a clear message, and each branch-scoped table gets a `WITH CHECK` using
  `branch_is_active(branch_id)` as it is added. The tree tables themselves carry the flag only; the
  per-table check lands with each later module's migration.
- **Not in this ADR:** `location`, `bin` (Inventory) and `number_series` (Accounting). Each gets its own plan.

### 2. Tables of access

| Table             | Main columns                                                                                                                                      | RLS                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `app_user`        | `organization_id`, `email`, `phone`, `password_hash` (argon2id), `display_name`, `is_active`, `locked_until`, `failed_attempts`, `mfa_secret_enc` | organization                                 |
| `role`            | `organization_id`, `code`, `name`, `is_system`                                                                                                    | organization                                 |
| `permission`      | `code` (primary key), `description`                                                                                                               | none: global, seeded, read-only to `erp_app` |
| `role_permission` | `role_id`, `permission_code`                                                                                                                      | through `role`                               |
| `user_scope`      | `user_id`, `role_id`, `business_id` (nullable), `branch_id` (nullable)                                                                            | organization                                 |
| `staff`           | `business_id`, `branch_id` (nullable), `user_id` (nullable), `name`, `phone`, `designation`, `is_active`                                          | business and branch                          |

Decisions inside this table:

- **`user_scope` is where a user holds a role.** The scope level comes from which columns are null:
  both null = whole group (Owner only); `business_id` only = one business; `branch_id` set = one branch
  (its `business_id` must also be set and must match the branch's business, by composite foreign key).
  A user can have several rows (for example Branch Manager of branch 1 and Cashier of branch 2).
- **No separate `membership` table.** The plan listed one. With one organization per user (below) it would
  repeat `app_user.organization_id`. If a person ever needs to belong to two organizations, it is added
  then with a migration and a new ADR.
- **One organization per user.** `app_user.organization_id` is `NOT NULL`. Email is unique across the whole
  system (`lower(email)`), so login needs no organization picker. See open question 1.
- **Group scope is Owner only.** A trigger on `user_scope` refuses a row with both columns null unless the
  role's `code` is `owner`. Another trigger refuses a role whose organization differs from the user's.
- **`app_user` and `user_scope` are read by `tenantMiddleware`** to build `req.tenant`. That read runs before
  a scope exists, so it goes through `AuthQuery` on the unscoped path (ADR 0005). No tenant Query reads
  these tables to decide what the caller may see.
- **`staff` is not a user.** A technician or a salesperson can exist as a record and be assigned work with no
  login. `staff.user_id` links one when a login exists. Salary data does not live here; salary entries are
  Accounting records that point at a staff record (plan C2).
- **Custom roles** (spec C-01) are `role` rows with `is_system = false`, built from the permission list.
  System roles cannot be edited or deactivated through the API.

### 3. The five roles and the permission list

Seeded per organization: **Owner, Business Manager, Branch Manager, Accountant, Cashier** (spec C-01 and
D-03, and the features doc; the queue's three-role line is replaced, plan C7).

- Permission codes are defined once in `shared/src/utils/permissions.ts` (a separate small PR, merged
  first, because it is shared code). The seed reads that file, so code and database cannot drift.
- Each module adds its own codes in its own PR. The seed is idempotent and only adds missing codes.
- The default role-to-permission mapping is **provisional** until ADR 0001 row 8 (role names) is accepted.
  The default role mapping in ADR 0006 section 8 (Permissions) is the first input.
- Cost price, profit and salary are hidden by permission codes (`cost.view`, `profit.view`, `salary.view`).
  This ADR only defines the codes; hiding them in responses is the job of the shared field rule in plan 2.5.

### 4. RLS per table

All policies use the functions from the RLS migration (#19): `app_organization_id()`, `app_business_ids()`,
`app_branch_ids()`. Policies read them as `(SELECT app_business_ids())` so the planner evaluates them once.

- Organization-level tables: `organization_id = (SELECT app_organization_id())`.
- Business-level tables: `business_id = ANY ((SELECT app_business_ids())::uuid[])`.
- Branch-scoped tables: the business check plus `branch_id = ANY ((SELECT app_branch_ids())::uuid[])`.
- Every table: `ENABLE` and `FORCE ROW LEVEL SECURITY`; `REVOKE DELETE ... FROM erp_app` in the same migration,
  because the default privileges in `01-app-role.sh` grant it. `permission` also revokes `INSERT` and `UPDATE`.
- A query with no scope set fails: the functions raise `tenant scope not set` (SQLSTATE `42501`) on a missing
  or empty value, never return null (ADR 0005, #19).

### 5. Prisma and migrations

- Schema files: `organization.prisma` and `auth.prisma` under `dal/prisma/schema/`, one migration each:
  `organization_tree` (A3), then `auth_access` (A4). RLS, triggers and grants are raw SQL in
  `dal/sql/rls/`, run in the same migration.
- **Back-relations (plan section 6).** A Prisma relation needs a field on both models, so
  `party.business_id → business` adds a field to `organization.prisma`. **Decision: accept one-line
  back-relation edits in another owner's schema file, with that owner as reviewer.** The alternative (plain
  columns, foreign keys in raw SQL) risks `db:migrate:check` reporting drift, and loses the relation types.
  This rule applies to every module that points at another owner's table.
- Composite foreign keys `(business_id, id)` (the ADR 0006 pattern) need `@@unique([businessId, id])` on the
  parent model. `business` and `branch` get it here so later modules can use it.
- Migration order and collision rules are in plan section 6: A3 merges before Farhan's Party migration; A4
  can merge after it, and is regenerated if both land the same day.

### 6. Tests first (written before the tables, run to see them fail)

Integration, real Postgres, connected as `erp_app`:

1. A user of business X cannot select, update or guess the id of business Y's branch or staff row.
2. A group Owner of organization A sees nothing of organization B (tree, users, roles, staff).
3. A pooled connection fails with `tenant scope not set` until the scope is set again (the functions raise).
4. `erp_app` cannot `DELETE` from any table in this ADR, and cannot touch the migration owner's objects.
5. A business cannot reference a legal entity of another organization (composite foreign key).
6. `user_scope`: both-null row refused for a non-Owner role; branch row with a mismatched business refused;
   role from another organization refused.
7. A deactivated branch refuses a write through the Manager; its history is still readable.
8. The seed creates exactly the five roles per organization and is safe to run twice.
9. `permission` is readable and not writable by `erp_app`.

Add the matching rows to `api/test/isolation/cases.ts` when routes appear (A6); this ADR adds no routes.

### 7. Order of work

1. **A2:** this ADR, reviewed and accepted by both.
2. **A4a (shared PR, merged first):** `permissions.ts` with the first codes and the five role codes.
3. **A3:** organization tree tables, RLS, grants, tests 1, 2, 3, 4, 5, 7.
4. **A4:** access tables, triggers, seed, tests 6, 8, 9.
5. Then the real `authMiddleware` (A5) and `tenantMiddleware` (A6, needs ADR 0007).

## Consequences

- Farhan's Party tables can reference `business` after A3 merges. Until then F2 stays blocked.
- Every later module gets the same two patterns for free: one RLS policy shape per level, and composite
  foreign keys to stop cross-business links.
- Adding a second organization per user, or a legal-entity level of books, needs a new ADR and a migration.
  The tables above do not rule either out.
- The Owner can be the only group-scope role. If a client later wants a group Accountant, the trigger
  and this ADR change together.
- Cross-owner back-relation edits are normal now. The cost is a one-line change in the other developer's
  schema file; the reviewer rule is what keeps it safe.
- Undoing this plan: nothing outside these two migrations depends on the table names until Party lands.
  After that, a rename needs a coordinated migration.

## Open questions (both developers to answer before this is Accepted)

1. **One organization per user, global unique email?** Recommended: yes for release 1. A consultant who
   serves two client organizations would need two logins.
2. **Role mapping:** is ADR 0006's provisional mapping the starting point for all five roles, or should
   each module's ADR propose its own codes and this one only seeds the role names?
3. **`business` insert policy:** is it acceptable that only provisioning creates the first business, and
   later businesses are created by an Owner request that passes the organization check only?
4. **`branch_is_active()` in `WITH CHECK`:** enforce it in each module's migration, or add one generic
   trigger that every branch-scoped table attaches? Recommended: the function in the policy, so no write
   path can skip it.
5. **Spec items still open** that touch these tables: ADR 0001 row 8 (role names), and whether MotoMart
   needs the five roles on day one or three is enough.

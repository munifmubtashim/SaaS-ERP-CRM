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
- Login runs outside a tenant scope (ADR 0005, `UnscopedQuery` for Auth and Health only). Provisioning is
  the one named exception, through `ProvisioningQuery` (section 1, amended in ADR 0005).
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
  `id = ANY ((SELECT app_branch_ids())::uuid[])`. **No branch is created through an RLS insert either:** a new
  branch is not yet in the caller's `app_branch_ids()`, so `INSERT ... RETURNING` fails the `SELECT` policy
  for the same reason as a business (next point). Branches use the provisioning path, and `erp_app` has no
  `INSERT` on `branch` (section 4).
- **`business` policy:** `USING (organization_id = (SELECT app_organization_id()) AND id = ANY ((SELECT app_business_ids())::uuid[]))`.
  **No business is created through an RLS insert.** A new business is not yet in the caller's
  `app_business_ids()`, and Prisma's `create` uses `INSERT ... RETURNING`, which Postgres checks against the
  `SELECT` policy, so a request insert would fail. The first business of a new organization and every later
  one are created by the provisioning path. `erp_app` has no `INSERT` on `business` (section 4).
- **The provisioning path** creates businesses and branches (and, for a new client, the organization and
  its legal entity, which is why its grants cover those two tables). It runs **unscoped** (no tenant transaction),
  and the Manager checks the Owner permission before calling it. It does not run as `erp_app`, which has no
  `INSERT` on these tables.
  - **It connects as a separate least-privilege role, `erp_provisioner`:** not the migration owner, not
    `BYPASSRLS`, owner of no table.
  - **`ProvisioningQuery` is the only code that connects as that role.** ADR 0005's unscoped rule names it
    as an exception next to `AuthQuery` and `HealthQuery` (amended there).
  - **Grants:** `INSERT` and `SELECT` on `organization`, `legal_entity`, `business` and `branch` only.
    `SELECT` is needed because Prisma's `create` runs `INSERT ... RETURNING`. No `UPDATE` or `DELETE`, and
    nothing on any other table.
  - **RLS stays forced.** The role gets its own `INSERT` and `SELECT` policies on those four tables
    (`TO erp_provisioner`), never `BYPASSRLS`. The policies are written in A3 with tests 12, 13 and 17.
- **Deactivation:** `is_active = false` keeps history and refuses new writes. Enforcement is two-layered:
  the Manager refuses with a clear message, and each branch-scoped table gets a `WITH CHECK` using
  `branch_is_active(branch_id)` as it is added. The tree tables themselves carry the flag only; the
  per-table check lands with each later module's migration.
- **Not in this ADR:** `location`, `bin` (Inventory) and `number_series` (Accounting). Each gets its own plan.

### 2. Tables of access

| Table             | Main columns                                                                                                                                      | RLS                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `app_user`        | `organization_id`, `email`, `phone`, `password_hash` (argon2id), `display_name`, `is_active`, `locked_until`, `failed_attempts`, `mfa_secret_enc` | none: read unscoped by `AuthQuery`, see below |
| `role`            | `organization_id`, `code`, `name`, `is_system`                                                                                                    | none: read unscoped by `AuthQuery`, see below |
| `permission`      | `code` (primary key), `description`                                                                                                               | none: global, seeded, read-only to `erp_app`  |
| `role_permission` | `role_id`, `permission_code`                                                                                                                      | none: read unscoped by `AuthQuery`, see below |
| `user_scope`      | `user_id`, `role_id`, `business_id` (nullable), `branch_id` (nullable)                                                                            | none: read unscoped by `AuthQuery`, see below |
| `staff`           | `business_id`, `branch_id` (nullable), `user_id` (nullable), `name`, `phone`, `designation`, `is_active`                                          | business, and branch when set (section 4)     |

Decisions inside this table:

- **`user_scope` is where a user holds a role.** The scope level comes from which columns are null:
  both null = whole group (Owner only); `business_id` only = one business; `branch_id` set = one branch
  (its `business_id` must also be set and must match the branch's business, by composite foreign key).
  A user can have several rows (for example Branch Manager of branch 1 and Cashier of branch 2).
- **No separate `membership` table.** The first plan listed one; plan 2.1 and A4 now match this ADR. With one organization per user (below) it would
  repeat `app_user.organization_id`. If a person ever needs to belong to two organizations, it is added
  then with a migration and a new ADR.
- **One organization per user.** `app_user.organization_id` is `NOT NULL`. Email is unique across the whole
  system (`lower(email)`), so login needs no organization picker. See open question 1.
- **Group scope is Owner only.** A trigger on `user_scope` refuses a row with both columns null unless the
  role's `code` is `owner`. Another trigger refuses a role whose organization differs from the user's.
- **No tenant RLS on `app_user`, `role`, `role_permission` and `user_scope`.** They are read before a scope
  exists: login, and `tenantMiddleware` building `req.tenant`. That read goes through `AuthQuery` on the
  unscoped path (ADR 0005), filtered by the authenticated user's own id. A tenant policy on these tables
  would make that read fail, because the RLS functions raise when no scope is set.
  - **Admin screens** (list users, edit roles, assign scopes) read and write these tables with an explicit
    `organization_id = <req.tenant organization>` filter in every query, and isolation tests prove it
    (section 6, tests 10 and 11).
  - **Trade-off, accepted:** the database does not stop an `erp_app` query from reading another
    organization's users, roles or scopes. A missing `organization_id` filter is a cross-organization leak
    (names, emails, phones, password hashes), caught only by review and tests, not by RLS. We accept this
    because the alternative (a `SECURITY DEFINER` lookup for login and scope) adds a privileged function
    that ADR 0005 avoids until a concrete case needs one. Revisit if a second team writes Queries against
    these tables, or if the isolation tests ever miss a case.
  - **Only `AuthQuery` reads these four tables.** A dal test (section 6, test 15) fails if any other file in
    dal names them, or if any schema file other than `auth.prisma` declares a Prisma relation to them. So
    the admin-screen reads and writes live in `AuthQuery` too, and a `PartyQuery` (for example) can never
    join or `include` `app_user`.
  - `staff` keeps RLS: it is business-owned data read by tenant Queries, never by login.
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
- **Code format:** `module.entity.action`, as typed in `permissions.ts` (roadmap 5.1). Every code has
  exactly three parts.
- Codes this ADR defines (cost price, profit and salary are hidden fields):

  | Code                     | What it allows                                       |
  | ------------------------ | ---------------------------------------------------- |
  | `product.cost.view`      | See cost price on products, stock and documents      |
  | `report.profit.view`     | See profit and margin figures in reports and screens |
  | `accounting.salary.view` | See salary entries and amounts                       |

  This ADR only defines the codes; hiding them in responses is the job of the shared field rule in plan 2.5.

- **Party codes** (agreed with Farhan on this PR; ADR 0006 updates its table to match):
  - Two entities: `party.customer.*` and `party.supplier.*` (`view`, `create`, `edit`, and so on), because
    selling and buying are done by different roles.
  - A party that is both a customer and a supplier (`is_customer` and `is_supplier`, ADR 0006) is
    **visible to a user holding either** `party.customer.view` or `party.supplier.view`.
  - **Each action needs the code for the role the party plays in it:** acting on the party as a customer
    needs `party.customer.<action>`, as a supplier `party.supplier.<action>`.

### 4. RLS per table

All policies use the functions from the RLS migration (#19): `app_organization_id()`, `app_business_ids()`,
`app_branch_ids()`. Policies read them as `(SELECT app_business_ids())` so the planner evaluates them once.

- Organization-level tables: `organization_id = (SELECT app_organization_id())`.
- Business-level tables: `business_id = ANY ((SELECT app_business_ids())::uuid[])`.
- Branch-scoped tables: the business check plus `branch_id = ANY ((SELECT app_branch_ids())::uuid[])`.
- `staff` (branch optional): the business check plus
  `(branch_id IS NULL OR branch_id = ANY ((SELECT app_branch_ids())::uuid[]))`, so business-level staff
  stay visible. Without the `IS NULL` case, `= ANY` is null for those rows and they disappear.
- `app_user`, `role`, `role_permission`, `user_scope`: no RLS (section 2). `permission`: no RLS, global.
- Every table: `ENABLE` and `FORCE ROW LEVEL SECURITY`; `REVOKE DELETE ... FROM erp_app` in the same migration,
  because the default privileges in `01-app-role.sh` grant it. `permission` also revokes `INSERT` and `UPDATE`;
  `business` and `branch` also revoke `INSERT` (provisioning only, section 1).
- `erp_provisioner`: `GRANT INSERT, SELECT` on `organization`, `legal_entity`, `business` and `branch`, and
  its own `INSERT` and `SELECT` policies `TO erp_provisioner` on those four tables. Nothing else (section 1).
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
  This rule applies to every module that points at another owner's table. Known back-relations so far:
  `business` (from `party`), and `staff` (from `party.assigned_to`, below). The four auth tables never get
  one outside `auth.prisma` (test 15).
- **`created_by` is a plain uuid column with no foreign key,** on every table that has it, in every module.
  The Manager sets it from the authenticated user, never from the request body (test 16). Why:
  - `app_user` rows are never deleted. The constraints above say: "Nothing in this ADR is ever deleted;
    records are deactivated." Section 4 adds "`REVOKE DELETE ... FROM erp_app` in the same migration". So a
    `created_by` cannot be left pointing at a removed user.
  - A foreign key that exists only in raw SQL fails `db:migrate:check`. Tested on 20 Nov 2026 with Prisma
    7.10.1: `prisma migrate diff` reported "Removed foreign key on columns (created_by)" and exited 2. A
    Prisma relation would avoid the drift, but any Query could then `include` the whole `app_user` row,
    which test 15 forbids.
  - The cost: the database does not prove that the id exists. Test 16 and review do.
- **`party.assigned_to` is a normal Prisma composite relation to `staff`:** `(business_id, assigned_to)` →
  `staff (business_id, id)`, so a party cannot be assigned to another business's staff. `staff` is not one
  of the four auth tables, so test 15 allows it. It needs the `@@unique` below and a back-relation field on
  `staff`.
- Composite foreign keys `(business_id, id)` (the ADR 0006 pattern) need `@@unique([businessId, id])` on the
  parent model. `business`, `branch` and `staff` get it here so later modules can use it. On `staff` it is
  what `party.assigned_to` points at (Farhan's follow-up migration after A4).
- Migration order and collision rules are in plan section 6: A3 merges before Farhan's Party migration; A4
  can merge after it, and is regenerated if both land the same day.

### 6. Tests first (written before the tables, run to see them fail)

Integration, real Postgres, connected as `erp_app`:

1. A user of business X cannot select, update or guess the id of business Y's branch or staff row.
2. A group Owner of organization A sees nothing of organization B's tree or staff (RLS).
3. A pooled connection fails with `tenant scope not set` until the scope is set again (the functions raise).
4. `erp_app` cannot `DELETE` from any table in this ADR, and cannot touch the migration owner's objects.
5. A business cannot reference a legal entity of another organization (composite foreign key).
6. `user_scope`: both-null row refused for a non-Owner role; branch row with a mismatched business refused;
   role from another organization refused.
7. A deactivated branch refuses a write through the Manager; its history is still readable.
8. The seed creates exactly the five roles per organization and is safe to run twice.
9. `permission` is readable and not writable by `erp_app`.
10. Isolation, no RLS: every admin Query on `app_user`, `role`, `role_permission` and `user_scope`, called
    for organization A, returns and changes nothing of organization B, including by guessed id.
11. `AuthQuery`'s scope read for user U returns only U's own `user_scope` rows.
12. `erp_app` still cannot `INSERT` into `business`, with `erp_provisioner` and its policies in place; the
    provisioning path can, after the Manager's Owner check.
13. `erp_app` still cannot `INSERT` into `branch` directly, with `erp_provisioner` and its policies in
    place; the provisioning path can, after the Manager's Owner check, and a non-Owner caller is refused
    before any insert.
14. A `staff` row with no branch is visible to every scope of its business; a row of branch 1 is not
    visible to a branch 2-only scope.

Unit, dal, no database:

15. A test with two checks:
    - it scans the dal source (Queries, raw SQL, Prisma calls) and fails if any file other than
      `AuthQuery.ts` reads `app_user`, `role`, `role_permission` or `user_scope` (by table name or Prisma
      model name);
    - it fails on any Prisma relation field to `AppUser`, `Role`, `RolePermission` or `UserScope` in a
      schema file other than `auth.prisma`.

Integration, real Postgres, continued:

16. Per module, for every create route: the stored `created_by` equals the authenticated caller, even when
    the request body sends another id. Each later module adds its own case.
17. `erp_provisioner` cannot `UPDATE` or `DELETE` `organization`, `legal_entity`, `business` or `branch`,
    and cannot read, insert, update or delete any other table.

Add the matching rows to `api/test/isolation/cases.ts` when routes appear (A6); this ADR adds no routes.

### 7. Order of work

1. **A2:** this ADR, reviewed and accepted by both.
2. **A4a (shared PR, merged first):** `permissions.ts` with the first codes and the five role codes.
3. **A3:** organization tree tables, RLS, grants, provisioning path and `erp_provisioner`, tests 1, 2, 3, 4, 5, 7, 12, 13, 16, 17.
4. **A4:** access tables (no tenant RLS), `staff` with RLS, triggers, seed, tests 6, 8, 9, 10, 11, 14, 15, 16.
5. Then the real `authMiddleware` (A5) and `tenantMiddleware` (A6, needs ADR 0007).

## Consequences

- Farhan's Party tables can reference `business` after A3 merges. Until then F2 stays blocked.
- Every later module gets the same two patterns for free: one RLS policy shape per level, and composite
  foreign keys to stop cross-business links.
- Adding a second organization per user, or a legal-entity level of books, needs a new ADR and a migration.
  The tables above do not rule either out.
- The Owner can be the only group-scope role. If a client later wants a group Accountant, the trigger
  and this ADR change together.
- Users, roles and scopes rely on application filters, not RLS (section 2 trade-off). Every Query that touches
  them needs an isolation test, and reviewers check the `organization_id` filter line by line.
- Creating a business or a branch goes through the provisioning path, never a tenant-scoped insert. Every
  later table whose new rows fall outside the caller's scope lists needs the same treatment.
- Cross-owner back-relation edits are normal now. The cost is a one-line change in the other developer's
  schema file; the reviewer rule is what keeps it safe.
- Undoing this plan: nothing outside these two migrations depends on the table names until Party lands.
  After that, a rename needs a coordinated migration.

## Open questions (both developers to answer before this is Accepted)

1. **One organization per user, global unique email?** Recommended: yes for release 1. A consultant who
   serves two client organizations would need two logins.
2. **Role mapping:** is ADR 0006's provisional mapping the starting point for all five roles, or should
   each module's ADR propose its own codes and this one only seeds the role names?
3. ~~`business` insert policy~~ Decided: every business and branch is created by the provisioning path
   (section 1).
4. **`branch_is_active()` in `WITH CHECK`:** enforce it in each module's migration, or add one generic
   trigger that every branch-scoped table attaches? Recommended: the function in the policy, so no write
   path can skip it.
5. **Spec items still open** that touch these tables: ADR 0001 row 8 (role names), and whether Moto Mart
   needs the five roles on day one or three is enough.
6. ~~Provisioning path connection~~ Decided (Munif and Farhan, 20 Nov): a separate least-privilege role,
   `erp_provisioner`, used only by `ProvisioningQuery`; a named exception in ADR 0005's unscoped rule. Grants,
   policies and tests in sections 1, 4 and 6.

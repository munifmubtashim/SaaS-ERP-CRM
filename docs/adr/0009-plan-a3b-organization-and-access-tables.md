# 0009: Plan for A3b, the organization tree (and the A4 access tables)

| Field               | Value                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| Status              | Proposed                                                                                          |
| Date                | 2026-11-20                                                                                        |
| Deciders            | Munif, Farhan                                                                                     |
| Spec / roadmap refs | ADR 0008 (merged) and its amendment (#27); ADR 0005; plan rows A3, A4, section 6; spec O-01, U-10 |

## Context

ADR 0008 decides the tables of the tenant tree and of access. CLAUDE.md requires an agreed, written plan
before tenancy, permissions or migration code, so this ADR is the implementation plan. No code is in this PR.

**Scope (decided by Munif on #31, 20 Nov): ADR 0008 section 7's split stands.**

- **A3b** is parts 1 and 2: the organization tree (`organization`, `legal_entity`, `business`, `branch`), its RLS,
  the provisioner's grants and policies, `branch_is_active()`, and their tests.
- **The access tables** (`staff`, `app_user`, `role`, `permission`, `role_permission`, `user_scope`) belong to
  **A4**. They are planned below as "A4 (parts 3 and 4)" so the whole schema is reviewed together, but they are
  not part of A3b.

**A3b depends on three open PRs.** Each part below says which one:

- **#27** (ADR 0008 amendment, Proposed): the provisioner sees one organization only; `created_by` is nullable on
  the four tree tables; ids come from `uuid_v7()`; the `@@unique` fix.
- **#28** (A3a): the `erp_provisioner` role must exist before a migration can grant to it.
- **#29**: the `uuid_v7()` function must exist before a column default can use it.

## Decision

### A3b (parts 1 and 2), each its own PR and its own migration

| Part | Branch                         | Migration                   | Contents                                                                                           | Size (approx.) | Needs merged first |
| ---- | ------------------------------ | --------------------------- | -------------------------------------------------------------------------------------------------- | -------------- | ------------------ |
| 1    | `feat/org-tables`              | `organization_tree`         | `organization`, `legal_entity`, `business`, `branch`; RLS for `erp_app`; composite keys; `REVOKE`s | ~420           | #27, #29           |
| 2    | `feat/org-provisioning-grants` | `organization_provisioning` | `erp_provisioner` grants and its own policies on `business` and `branch`; `branch_is_active()`     | ~250           | part 1, #28        |

**A3b in total: about 670 changed lines in two PRs.** Part 1 is over ~400 lines because tables and their RLS
must ship in one migration (a table without RLS is never allowed on `main`), and the RLS SQL appears twice by
design (`dal/sql/rls/` and the migration; a source test keeps them equal). Reviewers can skip the copy.

No Query, DTO, Manager or route is in A3b. `OrganizationQuery`, `ProvisioningQuery` and the Manager's Owner
check are A3c (ADR 0010).

#### Files and layers

Both parts are **dal only**, plus the dal integration tests:

- `dal/prisma/schema/organization.prisma`: `Organization`, `LegalEntity`, `Business`, `Branch` (part 1).
- `dal/sql/rls/organization.sql` (parts 1 and 2): the readable SQL, copied into each migration.
- `dal/sql/functions/branch_is_active.sql` (part 2), checked against the migration by the `sqlFunctions.ts`
  helper from #29.
- `dal/test/*.int.test.ts`: one file per part.

**Shared, both reviewers:** both migrations, and `main.prisma` only if the generator must change (not expected).

#### Table details (ADR 0008 sections 1 and 5)

- Ids: `@id @db.Uuid @default(dbgenerated("public.uuid_v7()"))` **(#27, #29)**.
- `created_at`, `updated_at` as `timestamptz`, UTC. `created_by` is a plain `uuid` with no foreign key, and on
  these four tables it is nullable: `NULL` means created by provisioning or seeded **(#27)**.
- `legal_entity` gets `@@unique([organizationId, id])`, for `business (organization_id, legal_entity_id)`.
  `branch` gets `@@unique([businessId, id])`, for A4's `user_scope`. `business` needs none **(#27 typo fix)**.

#### Grants and RLS (ADR 0008 section 4)

- **All four tables:** `ENABLE` and `FORCE ROW LEVEL SECURITY`; `REVOKE DELETE … FROM erp_app`.
- **`erp_app` policies, using the #19 functions in the `(SELECT …)::uuid[]` form:**
  - `organization`: `id = (SELECT app_organization_id())`.
  - `legal_entity`: `organization_id = (SELECT app_organization_id())`.
  - `business`: the organization check and `id = ANY ((SELECT app_business_ids())::uuid[])`.
  - `branch`: `business_id = ANY (…)` and `id = ANY ((SELECT app_branch_ids())::uuid[])`.
- **`REVOKE INSERT` from `erp_app`** on `business` and `branch` (provisioning only).
- **`erp_provisioner` (part 2; #27 and #28):** `GRANT INSERT, SELECT` on `business` and `branch` only.
  - Policies `TO erp_provisioner`: `business`: `organization_id = (SELECT app_organization_id())` for `USING`
    and `WITH CHECK`.
  - `branch`: `business_id IN (SELECT id FROM business WHERE organization_id = (SELECT app_organization_id()))`.
- **`branch_is_active(branch_id uuid) RETURNS boolean`:** `SQL STABLE`, not `SECURITY DEFINER`, fixed
  `search_path`. A branch outside the caller's scope reads as `NULL`, which a `WITH CHECK` treats as refused.
  Each later branch-scoped table adds it to its `WITH CHECK`; that half of test 7 goes on the first such table's
  checklist (Munif, 20 Nov).

#### Tests written first

| Part | ADR 0008 tests                                                                                                                                                                                                                                                                                                                     |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | 1 and 2 for the tree tables; 3; 4; 5. Plus: `FORCE ROW LEVEL SECURITY` is on for all four tables, and the source file matches the migration.                                                                                                                                                                                       |
| 2    | 12 and 13, database half (`erp_app` cannot insert a business or branch; `erp_provisioner` can, in its own organization); 17, including "cannot see another organization's business" (#27); `branch_is_active` directly. #28's "no privilege on any table yet" test changes to "INSERT and SELECT on `business` and `branch` only". |

Test 16 (`created_by` is the caller) applies to later modules' create routes, not to these tables (#27).

#### What blocks A3b, and what it blocks

- **Blocked by:**
  - #27 agreed (parts 1 and 2);
  - #29 merged (part 1's id defaults);
  - #28 merged, and every environment has run `npm run db:provisioner-role` (part 2: its `GRANT` fails if the
    role is missing).
- **Blocks:**
  - Farhan's A11 (party tables): needs part 1 only.
  - A3c (ADR 0010): needs parts 1 and 2.
  - A4 part 3: `user_scope` points at `branch`.
  - A13 (the journal references `business`).
  - The switcher (#12) and dashboard (A18) on real data.

### A4 (parts 3 and 4): the access tables, planned here, not part of A3b

**A4 also needs its own session and login ADR, agreed before part 3 starts.**

| Part | Branch                | Migration     | Contents                                                                                    | Size (approx.) | Needs merged first                     |
| ---- | --------------------- | ------------- | ------------------------------------------------------------------------------------------- | -------------- | -------------------------------------- |
| 3    | `feat/auth-tables`    | `auth_access` | `app_user`, `role`, `permission`, `role_permission`, `user_scope`; the two triggers; grants | ~400           | A3b part 1, #26, session and login ADR |
| 4    | `feat/staff-and-seed` | `staff`       | `staff` with RLS; the idempotent seed of the five roles and the permission list             | ~350           | part 3                                 |

**A4 in total: about 750 changed lines in two PRs.**

- **Files:**
  - `dal/prisma/schema/auth.prisma`: `AppUser`, `Role`, `Permission`, `RolePermission`, `UserScope` (part 3);
  - `Staff` in `organization.prisma` (part 4);
  - `dal/sql/triggers/user_scope.sql` (part 3);
  - the `staff` policy in `dal/sql/rls/organization.sql` (part 4);
  - the seed in `dal/prisma/seeds/`, run as the migration owner (part 4).
- **Table details:**
  - `user_scope (business_id, branch_id)` is a composite foreign key to `branch (business_id, id)`.
  - `staff` gets `@@unique([businessId, id])`, for `party.assigned_to`.
  - `app_user.email` is unique on `lower(email)`, which needs an expression index in raw SQL. **Check first**
    whether `db:migrate:check` reports it as drift (open question 4), the way the raw-SQL foreign key was
    checked on 20 Nov.
- **RLS and grants:**
  - no tenant RLS on `app_user`, `role`, `role_permission`, `user_scope` and `permission` (ADR 0008 section 2);
  - `staff`: the business check and `(branch_id IS NULL OR branch_id = ANY (…))`;
  - `REVOKE DELETE` everywhere, and `REVOKE INSERT, UPDATE` on `permission`.
- **Tests:**
  - part 3: 6 (the `user_scope` triggers), 9 (`permission` is read-only to `erp_app`), 15 (only `AuthQuery` names
    the four auth tables);
  - part 4: 8 and 18 (the seed), 14 (`staff` with no branch is visible to the whole business), and 1 and 2 for
    `staff`.
  - Tests 10 and 11 need `AuthQuery`, so they move to A5.
- **Blocked by:**
  - the session and login ADR;
  - A3b part 1;
  - #26 (the permission codes and roles the seed reads).
- **Blocks:** A5 login and A6 `tenantMiddleware`.

### For both A3b and A4

#### Invariants and tenancy rules that apply (CLAUDE.md)

- RLS **enabled and forced** on every tenant table; the app connects as `erp_app`, not owner, not BYPASSRLS.
- A query with no scope fails: the #19 functions raise. Nothing reads these tables outside `runInTenantScope`
  except `AuthQuery` (A5) and `ProvisioningQuery` (A3c), per ADR 0005's rule and its named exception.
- Nothing here is deleted; rows are deactivated (`REVOKE DELETE`).
- Never edit a migration that has reached `main`; `db:migrate:check` must pass after each part.
- Database conventions: singular snake_case tables, UUID v7 ids, UTC timestamps, `created_by`.
- Permissions: seeded from `shared/src/utils/permissions.ts` (#26), so code and database cannot drift.
- Money and stock invariants: not touched.

#### How the tests are seen failing first

Each part's tests are written and run before its migration. Run before the migration, they fail with
"relation does not exist" or "role does not exist". That proves little, so each part is also run once
**locally with the tables but without the RLS and grants**: then the RLS and privilege tests fail for the
real reason, and the RLS is added after.

Fixtures: `erp_app` cannot insert a business, so the tests insert the tree as the migration owner
(`MIGRATION_DATABASE_URL`) and clean up as the owner. Open question 6.

#### Migration steps, in order, for each part

1. `git fetch origin && git merge origin/main`, and tell Farhan which tables are coming (CLAUDE.md, plan
   section 6). **Part 1 is the one his Party migration (A11) waits for.**
2. Write the tests; run them and see them fail.
3. Edit only the owning schema file, then `npm run db:migrate:new -- <name>` and read every generated statement.
4. Append the raw SQL from `dal/sql/` to the same migration.
5. Apply locally without the RLS block once (see above), then with it.
6. `npm run db:migrate:deploy && npm run db:migrate:check && npm run test:integration`, then `npm run check`.
7. The PR lists the migration under "Migration notes".

### Open questions (for Farhan, and Munif where marked)

1. ~~**(Munif and Farhan) Numbering**~~ Decided by Munif on #31 (20 Nov): keep ADR 0008 section 7's split.
   The access tables are A4 (parts 3 and 4); A3b is parts 1 and 2.
2. **(A3b) `INSERT` on `organization` and `legal_entity` for `erp_app`.** #27 says they are seeded by the
   migration owner, so `erp_app` never needs to insert them. Revoke it too (least privilege), even though ADR 0008
   section 4 lists only `business`, `branch` and `permission`?
3. **(A3b) `version` on `business` and `branch`.** CLAUDE.md asks for it "where edited concurrently". Two admins
   renaming a branch at once is unlikely. Add it now, or wait?
4. **(A4) `lower(email)` uniqueness.** Is an expression index drift for `db:migrate:check`? If it is: a generated
   `email_normalised` column, `citext`, or the Manager lower-cases before writing, with a plain unique index.
5. **(A3b) Party timing.** Farhan's A11 migration right after part 1 merges, before part 2? Recommended: yes. Part
   2 changes only grants and policies on `business` and `branch`, and his `party` table doesn't depend on them.
6. **(A3b and A4) Test fixtures as the owner.** Is it acceptable for integration tests to insert and delete
   fixtures as the migration owner, because `erp_app` cannot?

## Consequences

- Every later module gets the same RLS shape per level and composite keys against cross-business links.
- A3b is two migrations; A4 adds two more. Each is reviewable, but each needs "merge `main`, tell Farhan" first.
- Part 2's `GRANT` to `erp_provisioner` makes every environment depend on the role script having run. A missing
  role fails the migration loudly, which is the intent.
- Undoing: before Party lands, each part can be reverted with a new migration that drops its objects. After
  that, `business` cannot be dropped without a coordinated migration.

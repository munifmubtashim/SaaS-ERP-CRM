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
- **`version` on `business` and `branch`** (Munif's answer, 21 Nov; open until Farhan agrees): `int NOT NULL
DEFAULT 1`. CLAUDE.md asks for it where rows are edited concurrently.
  - **How it goes up:** no trigger. The edit's Query runs `UPDATE … SET …, version = version + 1 WHERE id = $1
AND version = $read`. Zero rows updated means someone else changed it first: `409 CONFLICT`, field code
    `version.stale`.
  - **Who tests it:** A3b only sets the default (test case 2). The stale-version test belongs to the first PR
    that edits a business or a branch. A3c (#32) only creates rows, so that's a later admin-screen PR.
- **`branch.short_code`** (Munif's answer, 21 Nov, open until Farhan agrees; raised by ADR 0015 for receipt prefixes such as `RC-UTT-000123`):
  - `text NOT NULL`, short and uppercase: 2 to 6 characters, a letter first, then letters or digits.
  - A `CHECK (short_code ~ '^[A-Z][A-Z0-9]{1,5}$')` in raw SQL, because Prisma can't express it. The PR confirms
    `db:migrate:check` doesn't report the `CHECK` as drift.
  - `@@unique([businessId, shortCode])`: unique per business, so two businesses may both have `UTT`.
  - **It never changes after insert** (answers Farhan's point 3 on #31). ADR 0015 copies the prefix into each
    number series when the series is created. If a code could change and a freed code be reused, two branches
    would print the same receipt numbers. So:
    - `erp_app` has no `UPDATE` on `short_code` (section "Grants and RLS");
    - a trigger refuses any change to it, for every role, the owner included.

    `DELETE` is revoked too, so a code is never freed: a closed branch is deactivated and keeps its code.

  - The provisioning path (A3c, #32) takes `shortCode` in `createBranch`'s input, because the column is
    `NOT NULL`.

#### Grants and RLS (ADR 0008 section 4)

- **All four tables:** `ENABLE` and `FORCE ROW LEVEL SECURITY`; `REVOKE DELETE … FROM erp_app`.
- **`erp_app` policies are `TO erp_app`, one `FOR SELECT` and one `FOR UPDATE` per table** (answers Farhan's
  point 1). `erp_app` has no `INSERT` or `DELETE` on these tables, so it needs no other commands. Being `TO
erp_app`, they are never evaluated for `erp_provisioner`, whose transaction sets only `app.organization_id`.
  So it can't hit `app_business_ids()` and raise; its own `TO erp_provisioner` policies are in part 2. The
  expressions, using the #19 functions in the `(SELECT …)::uuid[]` form:
  - `organization`: `id = (SELECT app_organization_id())`.
  - `legal_entity`: `organization_id = (SELECT app_organization_id())`.
  - `business`: the organization check and `id = ANY ((SELECT app_business_ids())::uuid[])`.
  - `branch`: `business_id = ANY (…)` and `id = ANY ((SELECT app_branch_ids())::uuid[])`.
- **Owner policies `TO CURRENT_USER`** (Munif, 21 Nov; see "Test fixtures"): `FOR SELECT`, `INSERT`, `UPDATE` and
  `DELETE` on all four tables. They use the same scope expressions as `erp_app`'s, with `WITH CHECK` on writes,
  so the owner can seed or clean up only inside the `app.*` values it has set.
- **`UPDATE` for `erp_app` is column-level** (answers Farhan's point 2):
  - `organization`, `legal_entity`: **no `UPDATE`** in release 1. The owner or the seed changes them.
  - `business`: `UPDATE (name, bin, address, logo_key, invoice_prefix, opening_hours, fiscal_year_start_month,
is_active, version, updated_at)`.
  - `branch`: `UPDATE (name, address, opening_hours, is_active, version, updated_at)`.

  So `business.organization_id`, `business.legal_entity_id`, `branch.business_id` and `branch.short_code`
  can't be changed by `erp_app`. One trigger per table also refuses a change to these key columns for every role,
  the owner included: moving a branch would move its history into another business.

  **Fixing a key column later needs its own migration.** Because the trigger refuses the change for every role,
  correcting one (for example a branch created under the wrong business) can't be done by a query or a seed.
  It's a migration that replaces or drops the trigger for that one change and restores it in the same
  migration, reviewed by both developers like any migration.

- **`REVOKE INSERT` from `erp_app`** on all four tables (Munif, 21 Nov; ADR 0008 section 4 listed only
  `business` and `branch`).
  - `business` and `branch` are created only by the provisioning path (part 2, A3c).
  - **`organization` and `legal_entity` are not covered by `erp_provisioner`**, which gets `INSERT` and
    `SELECT` on `business` and `branch` only. Until onboarding a new client is designed (a later ADR, #27),
    they are created by the migration owner: the seed script (plan A19) or a person running it.
- **`erp_provisioner` (part 2; #27 and #28):** `GRANT INSERT, SELECT` on `business` and `branch` only.
  - Policies `TO erp_provisioner`: `business`: `organization_id = (SELECT app_organization_id())` for `USING`
    and `WITH CHECK`.
  - `branch`: `business_id IN (SELECT id FROM business WHERE organization_id = (SELECT app_organization_id()))`.
- **`branch_is_active(branch_id uuid) RETURNS boolean`:** `SQL STABLE`, not `SECURITY DEFINER`, fixed
  `search_path`. A branch outside the caller's scope reads as `NULL`, which a `WITH CHECK` treats as refused.
  Each later branch-scoped table adds it to its `WITH CHECK`; that half of test 7 goes on the first such table's
  checklist (Munif, 20 Nov). Party has no `branch_id`, so the first is whichever merges first: A13's `journal`
  (Munif, ADR 0013) or A15's `sales_payment` (Farhan). Both PRs' checklists list it, and the first one to merge
  carries the test (answers Farhan's point 8).

#### Tests written first

| Part | ADR 0008 tests                                                                                                                                                                                                                                                                                                                     |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | 1 and 2 for the tree tables; 3; 4; 5. Plus: `FORCE ROW LEVEL SECURITY` is on for all four tables, and the source file matches the migration.                                                                                                                                                                                       |
| 2    | 12 and 13, database half (`erp_app` cannot insert a business or branch; `erp_provisioner` can, in its own organization); 17, including "cannot see another organization's business" (#27); `branch_is_active` directly. #28's "no privilege on any table yet" test changes to "INSERT and SELECT on `business` and `branch` only". |

**Added to part 1 (Munif's answers, 21 Nov, and Farhan's review on #31):**

| Answer | Test case                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1      | `erp_app` cannot `INSERT` into `organization` or `legal_entity` (permission denied), as it already cannot into `business` and `branch`.                                                                                                                                                                                                                                                                                                   |
| 2      | A new `business` and `branch` row has `version = 1`; `version` is `NOT NULL`.                                                                                                                                                                                                                                                                                                                                                             |
| 3      | Inside the fixture helper's transaction, `current_setting('app.organization_id')`, `app.business_ids` and `app.branch_ids` hold the fixture's ids; a later transaction on the same pooled connection sees them unset.                                                                                                                                                                                                                     |
| 4      | `branch.short_code`: `UTT` and `AG2` are accepted; `utt`, `U`, `TOOLONG`, `U-T` and `2UT` are refused by the `CHECK`; a second branch with `UTT` in the same business is refused; `UTT` in another business is accepted.                                                                                                                                                                                                                  |
| 5      | `erp_app` cannot `UPDATE` `organization` or `legal_entity`, nor `business.organization_id`, `business.legal_entity_id`, `branch.business_id` or `branch.short_code` (permission denied). As the owner, a change to any of those four key columns is refused by the trigger.                                                                                                                                                               |
| 6      | **The owner path, without superuser or `BYPASSRLS`.** In the throwaway Postgres, the test creates such a role, a database it owns, and runs the migration as that role. Then, as that role: an insert with the `app.*` values set for the fixture's scope succeeds; an insert outside that scope, or with no `app.*` values set, is refused; a select returns only rows in the set scope. `erp_provisioner`'s own policies are unchanged. |

Test 16 (`created_by` is the caller) applies to later modules' create routes, not to these tables (#27).

#### Test fixtures (Munif's answer, 21 Nov, open until Farhan agrees)

- **Who inserts them:** integration tests insert and delete fixtures as the migration owner
  (`MIGRATION_DATABASE_URL`), because `erp_app` has no `INSERT` on these tables. Only the shared test helper
  does this; no test reads data back as the owner, it reads as `erp_app`.
- **The fixture helper always sets the `app.*` values** (`set_config(..., true)`, as `runInTenantScope` does) in
  the same transaction as its inserts.
- **RLS stays forced on the owner too** (Munif, 21 Nov, after Farhan's point 1 on #31):
  - The owner gets its **own policies, `TO CURRENT_USER`** (section "Grants and RLS"). When the migration creates
    a policy, PostgreSQL fixes `CURRENT_USER` to the role running it, which is the owner, so each environment's
    owner is named whatever it's called.
  - The seed script (plan A19) and the fixture helper **set the `app.*` values before writing**:
    1. take each new id first (`SELECT public.uuid_v7()`);
    2. set `app.organization_id`, `app.business_ids` and `app.branch_ids` with `set_config(..., true)` in the same
       transaction;
    3. insert, and delete in cleanup, inside that scope.
  - So the owner sees and writes only the scope it has set, like `erp_app`, and forced RLS means something for
    it. No role needs `BYPASSRLS`.
  - **Docker Compose and CI:** the owner there is the image's `POSTGRES_USER` (`erp_owner`), a superuser, which
    skips RLS whatever the policies say. So CI alone can't show that the owner path works. Test case 6 runs it
    as a role that is neither superuser nor `BYPASSRLS`.
  - **Hosting (#17):** a hosted owner without `BYPASSRLS` (for example on Neon) seeds through these same
    policies.
  - The earlier wording, "its fixtures work under either kind of owner", is withdrawn; test case 6 replaces it.

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
2. **(A3b) `INSERT` on `organization` and `legal_entity` for `erp_app`.** Munif's answer (21 Nov), **open until
   Farhan agrees:** revoked. `erp_provisioner` doesn't cover them; the owner or the seed creates them until onboarding is
   designed. See "Grants and RLS", test case 1.
3. **(A3b) `version` on `business` and `branch`.** Munif's answer (21 Nov), **open until Farhan agrees:** added
   now, raised by the edit's Query. See "Table
   details", test case 2.
4. **(A4) `lower(email)` uniqueness.** Is an expression index drift for `db:migrate:check`? If it is: a generated
   `email_normalised` column, `citext`, or the Manager lower-cases before writing, with a plain unique index.
5. ~~**(A3b) Party timing.**~~ Decided by Farhan on #31 (21 Nov): yes, Farhan's A11 migration goes right after
   part 1 merges, before part 2.
6. **(A3b and A4) Test fixtures as the owner.** Munif's answer (21 Nov), **open until Farhan agrees:** yes, through the shared test
   helper, which sets the `app.*` values and writes through the owner's own `TO CURRENT_USER` policies. See
   "Test fixtures", test cases 3 and 6.
7. **(A3b) `branch.short_code`** (raised by ADR 0015, #41). Munif's answer (21 Nov), **open until Farhan agrees:**
   added now, short and uppercase, unique per business, and never changed after insert. See "Table details", test case 4.

## Consequences

- Every later module gets the same RLS shape per level and composite keys against cross-business links.
- A3b is two migrations; A4 adds two more. Each is reviewable, but each needs "merge `main`, tell Farhan" first.
- Part 2's `GRANT` to `erp_provisioner` makes every environment depend on the role script having run. A missing
  role fails the migration loudly, which is the intent.
- Undoing: before Party lands, each part can be reverted with a new migration that drops its objects. After
  that, `business` cannot be dropped without a coordinated migration.

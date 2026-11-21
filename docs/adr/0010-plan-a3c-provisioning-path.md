# 0010: Plan for A3c, the provisioning path

| Field               | Value                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------- |
| Status              | Accepted (approved by Farhan on #32, 21 Nov)                                            |
| Date                | 2026-11-20                                                                              |
| Deciders            | Munif, Farhan                                                                           |
| Spec / roadmap refs | ADR 0008 section 1 and its amendment (#27); ADR 0005 named exception; ADR 0009; plan A3 |

## Context

A new business or branch cannot be created through `erp_app`'s RLS. It is not yet in the caller's scope, so
`INSERT … RETURNING` fails the `SELECT` policy (ADR 0008 section 1). ADR 0008 therefore gives creation to a
separate least-privilege role, `erp_provisioner`, used only by `ProvisioningQuery`.

A3a (#28) creates that role. ADR 0009 part 2 gives it `INSERT, SELECT` on `business` and `branch`, with its own
policies. This plan is the code that uses them: the provisioner database client, `ProvisioningQuery`, and the
Manager's Owner check. **No code is in this PR.**

**Depends on:**

- #27 agreed: the provisioner's transaction sets only `app.organization_id`, and `created_by` is `NULL` only on
  seeded rows; provisioned rows store the calling Owner.
- #28 merged: the role exists, and the lint guard is in place.
- ADR 0009 parts 1 and 2 merged: the tables, grants and policies.

## Decision

### Parts

| Part | Branch                      | Layer         | Contents                                                                                                                                                | Size (approx.) |
| ---- | --------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 1    | `feat/provisioning-query`   | dal (and env) | provisioner client, `ProvisioningQuery`, DTOs, `PROVISIONING_DATABASE_URL`                                                                              | ~350           |
| 2    | `feat/provisioning-manager` | businessLogic | `IProvisioningQuery` and `IRoleSource` contracts, `OrganizationManager.createBusiness` and `createBranch` with the Owner check, `createManagers` wiring | ~300           |

There are no routes. ADR 0008 adds none, and a create-business screen is later work. So no isolation case is
needed yet. The route that adds one must also add its case in `api/test/isolation/cases.ts`.

### Part 1: dal

- **`dal/config/provisionerDb.ts`:** builds a Prisma client from `PROVISIONING_DATABASE_URL`, with the same pool
  and timeout settings as `config/db.ts`. #28's lint rule lets only `ProvisioningQuery.ts` import it.
- **`dal/query/ProvisioningQuery.ts`:**
  - `createBusiness(organizationId, input)` and `createBranch(organizationId, businessId, input)`.
  - **`createBranch`'s input includes `shortCode`** (ADR 0009, #31: `branch.short_code` is `NOT NULL`, 2 to 6
    characters, a letter first, uppercase letters or digits, unique within the business, never changed).
    The database enforces the format (`CHECK`) and the uniqueness (`@@unique([businessId, shortCode])`). The Query
    maps a unique violation on that index to `AppError('CONFLICT')` with field code `branch.short_code_taken`,
    so a duplicate is never a 500.
  - Each runs **one interactive transaction on the provisioner client** that first calls
    `set_config('app.organization_id', $1, true)`. That is `SET LOCAL`; never a plain `SET` (CLAUDE.md
    tenancy). It does not set `app.business_ids` or `app.branch_ids` **(#27)**.
  - It then runs Prisma `create`, which is `INSERT … RETURNING`, so it needs the role's `SELECT` grant.
  - It returns a DTO. It does not extend `BaseQuery` (no tenant scope) or `UnscopedQuery` (not `erp_app`).
- **Keeping the connection in dal** (fixes the gap found while reviewing #28). CLAUDE.md builds clients in
  `createManagers` (businessLogic), and #28's lint rule only covers files inside dal. If businessLogic received
  the raw client, it could hand it to any Query.
  - So `ProvisioningQuery.ts` exports a factory, `createProvisioningQuery(url)`, which builds the client and the
    Query together.
  - `dal/index.ts` exports only that factory and the class's interface, never the client.
  - `createManagers` calls the factory. Open question 1.
- **`dto/OrganizationDTO.ts`:** `BusinessDTO` and `BranchDTO` with `fromRow`. No Prisma type leaves dal.
- **`api/config/env.ts`:** `PROVISIONING_DATABASE_URL`, plus its line in `.env.example` (built from #28's
  `PROVISIONER_DB_*` values) and the CI `env`. **Required in production, optional in tests and local
  development** (Munif, 20 Nov, on #32): in production a missing value fails at start-up; elsewhere provisioning
  is refused with `503 SERVICE_UNAVAILABLE`, field code `provisioning.not_configured`, and everything else runs.

### Part 2: businessLogic

- **`contracts/IProvisioningQuery.ts`** (the consumer owns the contract, CLAUDE.md).
- **`contracts/IRoleSource.ts`:** `roleCodesFor(userId, organizationId): Promise<RoleCode[]>`, typed with
  `RoleCode` from #26.
- **`shortCode` format, checked before the database:** `branchShortCodeSchema` in
  `shared/src/schemas/organization.schema.ts`: `z.string().regex(/^[A-Z][A-Z0-9]{1,5}$/)`, the same rule as
  ADR 0009's `CHECK`. It refuses lower case rather than changing it; the branch form upper-cases as you type.
  Shared code, so both review it. The api parses `createBranch`'s body with it (`parseInput`), and the Manager's
  unit tests use it too.
- **`OrganizationManager.createBusiness(caller, input)` and `createBranch(caller, businessId, input)`:**
  1. Refuse with `AppError('FORBIDDEN')` unless the caller's roles include `owner`, **before any query
     call** (ADR 0008 tests 12 and 13).
  2. Refuse a branch under a deactivated business (the Manager half of test 7). The Manager reads it through
     `IProvisioningQuery.findBusiness(organizationId, businessId)`, which returns `{ isActive }` or nothing, using
     the provisioner's `SELECT` grant in the same organization-only transaction. Nothing found and inactive are
     both refused before the insert. The database half is in ADR 0009 part 2: the provisioner's `branch`
     `WITH CHECK` also requires the business to be active (proposed on #31). A deactivation that commits in the
     same instant as a branch create can still let that one branch through. That's accepted: deactivation is a
     rare admin action, and the branch can be deactivated too.
  3. Call `ProvisioningQuery` with the caller's organization. **`created_by` is the calling Owner's user id**
     (decided by Munif, 21 Nov, after Farhan's point 3 on #32; replaces "`created_by` stays `NULL`"). `NULL` stays only for seeded
     rows, so #27's "`NULL` means provisioning or seeded" becomes "`NULL` means seeded". An `audit_log` row per
     created business and branch comes with the activity record (plan B2), not A3c. ⚠ **Known gap, owned by
     B2:** until then, provisioning writes no audit row (Farhan's point 3 on #32). The only record of who
     created a business or branch, and when, is its `created_by` and `created_at`. Accepted for release 1 by
     Munif (question 8).
- **`createManagers`:**
  - It needs a role source, and **throws at start-up if none is supplied. It never defaults to "allowed"**
    (Munif, 20 Nov, answer 3).
  - The real source is `AuthQuery`'s scope read (A5), so until then the api must pass something explicit.
    Open question 3.

### The route, and which transactions it runs (answers Farhan's points 1, 2 and 5 on #32)

- **The policies it meets.** ADR 0009 (#31, `e54b24c`) writes `erp_app`'s policies `TO erp_app` and the owner's
  `TO CURRENT_USER`, so the provisioner's `INSERT … RETURNING` is checked only against its own `TO
erp_provisioner` policies. Part 1's test runs the create with all of those policies on the table, to prove it.
- **The route is never inside `runInTenantScope`.**
  - `POST /v1/businesses` and `POST /v1/businesses/:id/branches` are a third route kind,
    `scope: 'provisioning'`: authenticated and Owner-only, but with no tenant transaction around them.
  - `ProvisioningQuery`'s transaction is the request's only transaction for the create: ADR 0005's named
    exception for the provisioner, not a second transaction inside a tenant one.
  - A route-coverage test fails if a `provisioning` route is mounted inside a tenant wrapper. Adding the route
    kind to `api/routes/types.ts` is shared code.
  - **Every `provisioning` route needs a cross-organization case** (Farhan's point 1 on #32, 21 Nov). CLAUDE.md
    requires a case in `api/test/isolation/cases.ts` only for tenant routes, so a new list,
    `PROVISIONING_CASES`, sits next to it. The route-coverage test fails for a `provisioning` route without
    one. The cases, as an Owner of organization A:
    - **Organization in the body:** a body that names organization B is created in A. The organization always
      comes from the caller's session; the schema strips any `organizationId` in the body.
    - **Branch under another organization's business:** a branch under one of organization B's business ids
      gets `404 NOT_FOUND`, not `403`, so the answer doesn't reveal that the id exists. The provisioner's RLS
      hides B's business, so `findBusiness` returns nothing, and nothing is inserted.
    - **Not an Owner:** a non-Owner of A is refused before any query.
  - **CLAUDE.md** gets a line for the third kind next to `public` and `tenant`, in its own small PR (shared
    rules: both review). Open question 7.
- **Work after the create** (the walk-in party, ADR 0006 section 6 and #54) runs **after** the provisioner's
  commit, in a **new** `runInTenantScope` for the new business, as `erp_app`.
  - It's idempotent (`ON CONFLICT DO NOTHING` on `UNIQUE (business_id) WHERE is_walk_in`).
  - **If it fails, two idempotent paths finish it** (Farhan's point 2 on #32, 21 Nov). A retried
    `POST /v1/businesses` gets `409 business.name_taken` and would never reach the walk-in step again, so:
    1. **On the `409` path,** when the existing business with that name is in the caller's organization, the
       route runs the walk-in step for that business (a new `runInTenantScope`, as `erp_app`) before answering
       `409`. So a retry finishes it, and the answer stays `409`.
    2. **As a backstop,** Party's walk-in lookup creates the walk-in party if it's missing, with the same
       statement, the first time a sale or payment needs it. That's ADR 0019's second option (#54), kept as a
       backstop and not the main path. It's Party's code, so Farhan adds it in ADR 0019.

    Two at once still leave exactly one row, because of the unique index.

    **`Idempotency-Key` (ADR 0011) doesn't cover this retry, and the two paths above don't change.** ADR 0011's
    key row is per business (`business_id` is the request's active business, with RLS on it), and the tenant
    route wrapper claims it inside the tenant transaction (ADR 0014). A `provisioning` route has no business
    before the create and runs outside `runInTenantScope`, so there's nothing to write the key against. A
    retried create is recognised by the business name instead: the case-insensitive unique gives `409
business.name_taken`, and path 1 finishes the walk-in from there. If provisioning ever needs replay with
    the first `201` answer, that's a key table scoped to the organization, in a later ADR.

  - Each transaction is whole; nothing is half-done inside one.
- **`shortCode` never changes:** enforced in ADR 0009 (#31, `e54b24c`). `erp_app` has no `UPDATE` on
  `branch.short_code`, and a trigger refuses the change for every role.
- **A retry can't create the same business twice** (Farhan's point 7). The proposal on #31 is
  a case-insensitive unique name per organization on `business`, a deactivated business's name included. A
  second create with the same name, in any letter case, gets `409 CONFLICT`, field code `business.name_taken`,
  and inserts nothing. Branches are already protected by `short_code`.

### Invariants and tenancy rules that apply

- Every query that runs as the provisioner sits in one transaction with `SET LOCAL app.organization_id`. The
  RLS functions raise when the value is missing, so a forgotten `set_config` fails loudly.
- `erp_provisioner` is least privilege: `INSERT, SELECT` on two tables. It cannot update, delete or touch
  any other table (test 17, from ADR 0009 part 2).
- Layers: Controller → Manager → Query. The Owner rule lives in the Manager; SQL lives only in dal; nothing
  above dal sees Prisma.
- Construction happens only in `createManagers`; dependencies arrive through constructors, typed as interfaces.
- Not touched: money, stock, NID.

### Tests written first, and how they will fail

| Part | Tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | First failure                                                                                    |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1    | Integration, as `erp_provisioner`: creates a business and a branch in organization A and gets the row back; cannot create a business with organization B's id; cannot see organization B's businesses; the transaction leaves `app.business_ids` unset (so `app_business_ids()` raises inside it); a missing `PROVISIONING_DATABASE_URL` fails at start-up in production; elsewhere provisioning is refused with `503` and `provisioning.not_configured`. **With ADR 0009's `TO erp_app` and owner policies on the table**, the create still succeeds. `created_by` is the calling Owner's id. A branch under an inactive business is refused by the `WITH CHECK`. A second business with the same name in any letter case in the organization gets `409` with `business.name_taken`. **`PROVISIONING_CASES`** (the three cross-organization cases above) pass, and the route-coverage test fails for a `provisioning` route without a case. **`shortCode`:** a branch with `UTT` is created and reads back `UTT`; a second branch with `UTT` in the same business gets `409` with `branch.short_code_taken` and inserts nothing; `UTT` in another business of the same organization is accepted. | `ProvisioningQuery` and the factory do not exist (import errors), then RLS refusals once they do |
| 2    | Unit, with fakes: a non-Owner is refused and the fake Query is **never called**; an Owner's call reaches the Query with the caller's organization; a branch under a deactivated or unknown business is refused after `findBusiness`, with no insert; `createManagers` throws when no role source is supplied; **walk-in retry:** a fake walk-in step that fails leaves the business committed; a retried create gets `409 business.name_taken` and now runs the walk-in step, so it exists after the retry; `branchShortCodeSchema` accepts `UTT` and `AG2` and refuses `utt`, `U`, `TOOLONG`, `U-T` and `2UT`, and a refused code never reaches the fake Query.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | the Manager methods and contracts do not exist                                                   |

### Order

1. ADR 0009 parts 1 and 2 merged; #27 agreed; #28 merged.
2. Part 1, then part 2.
3. A5 (`AuthQuery`) replaces the interim role source.

### What blocks this, and what this blocks

- **Blocked by:** #27, #28, and ADR 0009 parts 1 and 2. Part 2 also needs #26 for `RoleCode`.
- **Blocks:** any screen or route that creates a business or branch; onboarding a second business (O-10);
  realistic sample data through the app rather than the owner seed (A19).

### Open questions (for Farhan, and Munif where marked)

1. ~~**Factory in `ProvisioningQuery.ts`.**~~ Decided by Farhan on #32 (21 Nov): yes.
2. ~~**(Munif) `PROVISIONING_DATABASE_URL`, required or optional?**~~ Answered by Munif on #32 (20 Nov): required in
   production, optional in tests and local development (Part 1). Agreed by Farhan, 21 Nov.
3. ~~**(Munif) The interim role source until A5.**~~ Decided by Farhan on #32 (21 Nov): yes, an explicit deny-all
   source.
4. ~~**Does `OrganizationQuery` belong here?**~~ Decided by Farhan on #32 (21 Nov): no, its reads go in A6.
5. **`created_by` is the calling Owner.** Munif's answer (21 Nov), agreed by Farhan, 21 Nov. #27 now says "`NULL`
   only when seeded".
6. **Business names unique per organization, case-insensitive.** Munif's answer (21 Nov), agreed by Farhan, 21 Nov; the detail is in ADR 0009 (#31). ⚠ A deactivated business keeps its name taken; the Owner renames it
   to free the name.
7. **(Both, new) The CLAUDE.md line for the `provisioning` route kind.** Its own small PR, after this ADR is
   agreed, reviewed by both. Recommended: Munif opens it.
8. ~~**(Munif) No audit row for provisioning until B2.**~~ Decided by Munif (21 Nov): accepted for release 1,
   as a **known gap owned by B2**. Until B2, the record is the row's `created_by` and `created_at` only. When
   B2 lands, provisioning writes one audit row per created business and branch.

## Consequences

- Business and branch creation becomes a code path that RLS keeps inside one organization, run by a role
  that can do nothing else.
- One more database URL to configure in every environment.
- Undoing: no schema change here. Revert the code; the grants stay with ADR 0009 part 2.

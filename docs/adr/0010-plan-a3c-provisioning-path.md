# 0010: Plan for A3c, the provisioning path

| Field               | Value                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------- |
| Status              | Proposed                                                                                |
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

- #27 agreed: the provisioner's transaction sets only `app.organization_id`, and `created_by` is `NULL` on
  provisioned rows.
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
  `PROVISIONER_DB_*` values) and the CI `env`. Required or optional: open question 2.

### Part 2: businessLogic

- **`contracts/IProvisioningQuery.ts`** (the consumer owns the contract, CLAUDE.md).
- **`contracts/IRoleSource.ts`:** `roleCodesFor(userId, organizationId): Promise<RoleCode[]>`, typed with
  `RoleCode` from #26.
- **`OrganizationManager.createBusiness(caller, input)` and `createBranch(caller, businessId, input)`:**
  1. Refuse with `AppError('FORBIDDEN')` unless the caller's roles include `owner`, **before any query
     call** (ADR 0008 tests 12 and 13).
  2. Refuse a branch under a deactivated business (the Manager half of test 7).
  3. Call `ProvisioningQuery` with the caller's organization. `created_by` stays `NULL` **(#27)**.
- **`createManagers`:**
  - It needs a role source, and **throws at start-up if none is supplied. It never defaults to "allowed"**
    (Munif, 20 Nov, answer 3).
  - The real source is `AuthQuery`'s scope read (A5), so until then the api must pass something explicit.
    Open question 3.

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

| Part | Tests                                                                                                                                                                                                                                                                                                                                                                                                    | First failure                                                                                    |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1    | Integration, as `erp_provisioner`: creates a business and a branch in organization A and gets the row back; cannot create a business with organization B's id; cannot see organization B's businesses; the transaction leaves `app.business_ids` unset (so `app_business_ids()` raises inside it); `created_by` is `NULL`; a missing `PROVISIONING_DATABASE_URL` fails at start-up with a clear message. | `ProvisioningQuery` and the factory do not exist (import errors), then RLS refusals once they do |
| 2    | Unit, with fakes: a non-Owner is refused and the fake Query is **never called**; an Owner's call reaches the Query with the caller's organization; a branch under a deactivated business is refused; `createManagers` throws when no role source is supplied.                                                                                                                                            | the Manager methods and contracts do not exist                                                   |

### Order

1. ADR 0009 parts 1 and 2 merged; #27 agreed; #28 merged.
2. Part 1, then part 2.
3. A5 (`AuthQuery`) replaces the interim role source.

### What blocks this, and what this blocks

- **Blocked by:** #27, #28, and ADR 0009 parts 1 and 2. Part 2 also needs #26 for `RoleCode`.
- **Blocks:** any screen or route that creates a business or branch; onboarding a second business (O-10);
  realistic sample data through the app rather than the owner seed (A19).

### Open questions (for Farhan, and Munif where marked)

1. **Factory in `ProvisioningQuery.ts`.** It builds the client and the Query together, so businessLogic never
   holds the provisioner client. That is a small exception to "never `new` a dependency inside a class": the
   factory is a function next to the class, not inside it. Acceptable?
2. **(Munif) `PROVISIONING_DATABASE_URL`, required or optional?**
   - Required fails fast, but breaks every existing `.env` until the line is added.
   - Optional means provisioning is refused with a clear error when the URL is missing.
   - Recommended: required, with a README line.
3. **(Munif) The interim role source until A5.** An explicit deny-all source in the api's `createManagers` call
   is "supplied", and safe: every provisioning call is refused until A5. Is that acceptable under answer 3?
4. **Does `OrganizationQuery` belong here?** Tenant-scoped reads of businesses and branches, for the switcher, fit
   A6 (`tenantMiddleware`) better. Recommended: leave them out of A3c.

## Consequences

- Business and branch creation becomes a code path that RLS keeps inside one organization, run by a role
  that can do nothing else.
- One more database URL to configure in every environment.
- Undoing: no schema change here. Revert the code; the grants stay with ADR 0009 part 2.

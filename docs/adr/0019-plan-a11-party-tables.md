# 0019: Plan for A11, the party table, create, edit and the duplicate-phone warning

| Field               | Value                                                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Status              | Proposed                                                                                                               |
| Date                | 2026-11-21                                                                                                             |
| Deciders            | Farhan (owner), Munif                                                                                                  |
| Spec / roadmap refs | spec CR-01, CR-02, C-01, S-15; ADR 0005, 0006, 0008, 0009 (#31), 0011, 0014 (#40), 0015 (#41); plan rows A10a, A11, F2 |

## Context

ADR 0006 decides what Party is: business-owned, business-wide (no `branch_id`), composite keys against
cross-business links, no balance column, the NID kept apart. Its order of work, steps 3 to 6, is plan row **A11**
(F2): the party table with RLS, create, edit, deactivate, and the duplicate-phone warning. A11 adds a tenant
table, a migration and permission checks, so CLAUDE.md requires an agreed, written plan before any code. This
ADR is that plan. No code is in this PR.

What A11 builds on, and where each piece is:

- **On `main`:** the RLS functions `app_business_ids()` and `app_branch_ids()` (#19), `runInTenantScope` and
  `BaseQuery` (ADR 0005), the F1a read shapes (`partyBaseSchema`, `partyListItemSchema`, cursor pagination).
- **Open:** the organization tree, with `business` and `branch` (A3b, ADR 0009, [#31](https://github.com/munifmubtashim/SaaS-ERP-CRM/pull/31)); `uuid_v7()` (#29); the
  ADR 0008 amendment, with nullable `created_by` and the `uuid_v7()` default (#27); the Decimal helpers on
  `BaseDTO` (A10a, #42); the route wrapper with `{status, body}` Controllers (#8); permission codes (A4a, #26);
  ADR 0006's per-kind codes (#52); the profile read shape `partyDetailSchema` (#47).
- **Not started:** login and `req.user` (A5), `tenantMiddleware` reading the active business (A6), the
  isolation runner (A7), idempotent routes (A14 part 2), number series (A14a).

So the database half of A11 waits only for A3b part 1 and #29. The route half waits for login and the tenant
middleware. The plan's fallback applies: if they slip, the Manager is built and tested against an in-memory
fake of `IPartyQuery` (plan, "If A3 or A13 slips").

## Decision

### 1. The tables A11 creates

A11 creates one table (`party`), or two if question 1 picks the counter. Only the columns F2 needs, so nothing
waits on an unfinished design. Every other Party table comes with the step that uses it (ADR 0006 section 12):

| Table             | Comes with                                                   |
| ----------------- | ------------------------------------------------------------ |
| `party_identity`  | NID, step 7                                                  |
| `party_contact`   | contacts and addresses, after F2                             |
| `party_address`   | contacts and addresses, after F2                             |
| `party_group`     | groups, after F2 (`party_group_id` is added then)            |
| `credit_hold`     | credit limit and holds, step 9 (C17)                         |
| `party_relation`  | guarantor, step 9 (C18)                                      |
| `party_merge_log` | merge, step 8 (`merged_into_id` and `merged` are added then) |

Until `credit_hold` exists, `onCreditHold` in `partyDetailSchema` (#47) is always `false`.

### 2. The `party` table

Model `Party` in `dal/prisma/schema/party.prisma`, `@@map("party")`. Migration name `party`.

| Column              | Type                                    | Rule                                                                                 |
| ------------------- | --------------------------------------- | ------------------------------------------------------------------------------------ |
| `id`                | `uuid`                                  | `DEFAULT public.uuid_v7()` (#29)                                                     |
| `business_id`       | `uuid` not null                         | FK → `business (id)`. From the scope, never from the body                            |
| `code`              | `text` not null                         | `UNIQUE (business_id, code)`, up to 32 characters. See open question 1               |
| `name`              | `text` not null                         | 1 to 200 characters                                                                  |
| `name_bn`           | `text`                                  | null when blank (the F2 form sends `null`)                                           |
| `kind`              | `text` not null                         | `CHECK (kind IN ('person', 'company'))`                                              |
| `is_customer`       | `boolean` not null                      | `CHECK (is_customer OR is_supplier)`                                                 |
| `is_supplier`       | `boolean` not null                      |                                                                                      |
| `phone_e164`        | `text` not null                         | E.164, normalised before storing (section 4)                                         |
| `alt_phone_e164`    | `text`                                  | E.164                                                                                |
| `email`             | `text`                                  |                                                                                      |
| `address`           | `text`                                  | up to 500 characters                                                                 |
| `area`              | `text`                                  | free text, up to 100 characters (ADR 0006 open question 4)                           |
| `credit_limit`      | `numeric(18,2)`                         | null = no limit, the default (S-15). `CHECK (credit_limit >= 0)`. Read with A10a     |
| `pay_term_days`     | `integer`                               | null = business default. `CHECK (pay_term_days BETWEEN 0 AND 365)`                   |
| `status`            | `text` not null, default `'active'`     | `CHECK (status IN ('active', 'inactive'))`. See open question 3                      |
| `is_walk_in`        | `boolean` not null, default `false`     | at most one per business: partial unique index `(business_id) WHERE is_walk_in`      |
| `assigned_to`       | `uuid`                                  | plain `uuid` for now. FK → `staff (business_id, id)` in a follow-up after A4         |
| `created_branch_id` | `uuid`                                  | composite FK `(business_id, created_branch_id)` → `branch (business_id, id)`         |
| `created_at`        | `timestamptz` not null, default `now()` | UTC                                                                                  |
| `updated_at`        | `timestamptz` not null, default `now()` | Prisma `@updatedAt`; the default covers raw SQL inserts such as seeds                |
| `created_by`        | `uuid`                                  | no FK, ever (ADR 0008). `CHECK (created_by IS NOT NULL OR is_walk_in)`. See open q 2 |
| `version`           | `integer` not null, default `1`         | optimistic concurrency                                                               |

Keys and indexes:

- `UNIQUE (business_id, id)`: the target of every composite FK from other tables (ADR 0006 section 2).
- `(business_id, phone_e164)` and `(business_id, alt_phone_e164)`: the duplicate check.
- `(business_id, name)`: the list order. Search is open question 4.
- `bin` is left out until the BIN rules (after the Phase 1 gate).

Prisma relations and back-relations (ADR 0008 section 5):

- `business_id` → `business` and `(business_id, created_branch_id)` → `branch` are Prisma relations, so
  `db:migrate:check` sees the foreign keys and reports no drift.
- A Prisma relation needs a field on both models. So part 3 adds one back-relation line each to `Business` and
  `Branch` in Munif's `organization.prisma`, and nothing else in that file. ADR 0008 section 5 allows this
  one-line edit in another owner's schema file, with that owner as reviewer: Munif reviews those lines.
- Part 6 adds the same kind of line to `Staff` (also in `organization.prisma`, A4 part 4) for `assigned_to`.
- `created_by` gets no relation, and nothing in `party.prisma` points at `AppUser`, `Role`, `RolePermission` or
  `UserScope` (ADR 0008 test 15).

### 3. RLS and grants (in the migration and in `dal/sql/rls/party.sql`)

- `ENABLE` and `FORCE ROW LEVEL SECURITY`.
- One policy for `erp_app`, using the #19 functions in the `(SELECT …)::uuid[]` form:
  `USING` and `WITH CHECK` both `business_id = ANY ((SELECT app_business_ids())::uuid[])`. No branch
  condition: Party is business-wide (ADR 0006 section 1).
- `REVOKE DELETE ON party FROM erp_app`. The default privileges grant it, and a party is deactivated, never
  deleted.
- The source file and the migration must define the same policy (the `RlsSqlSource` pattern).
- **The owner role has no policy on `party`.** The policy is `TO erp_app` only, so under forced RLS a migration
  owner that isn't a superuser (the Neon demo host in #17) is refused every row, for example when a seed inserts
  sample customers. This must follow Munif's answer to [question 1 on #31](https://github.com/munifmubtashim/SaaS-ERP-CRM/pull/31#issuecomment-7060072315), so the tree tables and
  `party` treat the owner the same way.

### 4. Shared code first (both reviewers)

- **Phone normaliser** in `shared/src/utils/phone.ts`. `01712345678`, `8801712345678` and `+8801712345678`
  all become `+8801712345678`. A Bangladesh mobile must match `+8801[3-9]` plus 8 digits. Other countries are
  allowed with a `+` and a country code. Form and API call the same function.
- **Payloads** in `party.schema.ts`, picked from `partyBaseSchema`:
  - `createPartySchema`: no `id`, `businessId`, `code`, `status`, `version`, `createdBy` or timestamps. It
    carries `confirmDuplicate` (default `false`).
  - `updatePartySchema`: the same editable fields plus the `version` read, also with `confirmDuplicate`.
- **Error code** `PARTY_POSSIBLE_DUPLICATE` (409) in `AppError`. Its `fields` name the matching field; the body
  lists the matching parties' id, code and name. Never the NID.

### 5. Layers

- **`PartyQuery`** (dal): `create`, `get`, `list` (cursor, filters from `partyListQuerySchema`), `update` with
  a conditional `UPDATE … WHERE id = $1 AND version = $2` (invariant 6; 0 rows means a stale version),
  `setStatus` the same way, and `findByPhones(phones, exceptId)` for the duplicate check. Every method uses
  `currentClient()`, so it fails outside a tenant scope. `PartyDTO.fromRow` reads `credit_limit` with A10a's
  `moneyFromDecimal` and keeps `name_bn` null.
- **`PartyManager`** (businessLogic), behind `IPartyQuery`:
  - The business is the scope's one active business; a write with more than one is refused (ADR 0005).
  - `created_by` is the logged-in user (ADR 0008 test 16), and `created_branch_id` is the request's branch.
  - Phones are normalised, then checked against active parties of the same business. A match without
    `confirmDuplicate` is `PARTY_POSSIBLE_DUPLICATE`.
  - The walk-in party can't be deactivated.
  - Permissions use ADR 0006's per-kind codes (#52): creating a customer needs `party.customer.create`,
    and so on.
- **`PartyController` and `PartyRoutes`** (api), all `scope: 'tenant'`, each with an isolation case:
  `GET /v1/parties`, `POST /v1/parties`, `GET /v1/parties/:id`, `PATCH /v1/parties/:id` and
  `POST /v1/parties/:id/deactivate` (ADR 0006 section 9). Controllers return `{status, body}` (#8).

### 6. Tests to write first

Database (real Postgres, as `erp_app`). The numbers in brackets are ADR 0006's test numbers.

1. RLS is enabled **and forced** on `party`. A query outside a tenant scope fails [18].
2. A user scoped to business X can't read, update or guess the id of a party of business Y [5].
3. `erp_app` can't `DELETE` from `party`.
4. `created_branch_id` pointing at a branch of another business fails on the composite FK, even as the owner
   [7].
5. `UNIQUE (business_id, code)`: the same code is allowed in two businesses and refused twice in one.
6. A second walk-in party in one business fails. A non-walk-in party without `created_by` fails.
7. `credit_limit` `50000.00` and `0.00` read back as `"50000.00"` and `"0.00"`. A negative limit fails.
8. A stale `version` updates no row.
9. The source file and the migration define the same policy.

Manager (unit, fake `IPartyQuery`):

10. A new party goes to the scope's business; a `businessId` or `createdBy` in the body is ignored [8].
11. The same phone in the same business is a 409 with the match listed. `confirmDuplicate: true` creates it.
12. The same phone in another business gives no warning, so nothing leaks [6].
13. A stale `version` is a 409 `CONFLICT` [14]. The walk-in party can't be deactivated [17].
14. The phone normaliser accepts the three Bangladesh forms and refuses `0171234567` and `01212345678` [1].

API (Supertest, real Postgres):

15. Every route has an isolation case. Business X gets 404 for business Y's party id, not 403 [5].
16. A user of branch 1 lists a party created in branch 2 of the same business [9].
17. No list or detail response contains `nid`, `nid_ciphertext` or `nid_hash` [11].
18. A cashier without `party.customer.edit` gets 403 on `PATCH`.
19. A user without `party.customer.create` gets 403 on `POST /v1/parties` for a customer. A supplier-only user
    (with `party.supplier.create` but not `party.customer.create`) can't create a customer.

### 7. Order of work (each a separate PR, under ~400 lines)

| Part | Branch                    | Contents                                                                                                                                   | Needs merged first                                   |
| ---- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| 1    | `feat/party-payloads`     | phone normaliser, create and update payloads, `PARTY_POSSIBLE_DUPLICATE`                                                                   | this ADR (shared code: both review)                  |
| 2    | `feat/party-manager`      | `IPartyQuery`, `PartyManager`, tests 10 to 14 against a fake Query                                                                         | part 1                                               |
| 3    | `feat/party-table`        | `party.prisma`, back-relations on `Business` and `Branch` (Munif reviews), migration `party`, `sql/rls/party.sql`, `PartyQuery`, tests 1–9 | A3b part 1 (#31), #29, #27, A10a (#42); merge `main` |
| 4    | `feat/party-routes`       | `PartyController`, `PartyRoutes`, isolation cases, tests 15 to 19                                                                          | parts 2 and 3, #8, A5, A6, A4a (#26), #52            |
| 5    | `feat/party-service-live` | frontend: `createServices` uses `PartyService(http)` instead of the mock                                                                   | part 4                                               |
| 6    | `feat/party-assigned-to`  | follow-up migration: `assigned_to` FK → `staff (business_id, id)`, back-relation on `Staff` (Munif reviews)                                | A4 part 4 (`staff`), merge `main` and tell Munif     |

Parts 1 and 2 need no table, so they can start as soon as this ADR is agreed. Before part 3 and part 6, merge
`main` and tell Munif a migration is in flight (CLAUDE.md).

## Consequences

- F2 gets one table (`party`), or two if question 1 picks the counter, in one migration. The other Party tables
  each come with their own feature, so none is designed before it is needed. The cost is several small Party
  migrations instead of one.
- `onCreditHold` is a constant `false` until `credit_hold` exists. The profile screen shows no hold until then.
- The duplicate check is a warning, not a unique index: two parallel creates with the same phone can both
  succeed. That is accepted (CR-02 asks for a warning).
- Every later module that references a party points `(business_id, party_id)` at the party's
  `UNIQUE (business_id, id)`.
- **Keep true:** no `DELETE` on `party`; the business comes from the scope; `created_by` comes from the user;
  no NID column on `party`.
- **Undo:** before go-live, drop the table in a new migration and remove the routes. Nothing else depends on it
  until Sales (A15) references `party`.

## Open questions for Munif

1. **Party code.** Where does `code` (such as `C-000001`) come from? ADR 0015 ([#41](https://github.com/munifmubtashim/SaaS-ERP-CRM/pull/41)) at `40f3a0c` adds
   **business-wide series**: `branch_id` is null, the prefix has no branch code (`C-`), one row per business and
   kind (unique with `NULLS NOT DISTINCT`), taken with `next('party_code', null)`. A11 would add the
   `party_code` kind. #41 is still a draft, and its question 6 asks whether this is what A11 needs.
   - Recommended: the business-wide `party_code` series from A14a, with prefix `C-` and #41's default width 6,
     so codes read `C-000001`. Part 3 then needs A14a merged first. A number wider than the width would be cut
     only if the formatting were done with SQL `lpad`. ADR 0015 formats in TypeScript (`NumberSeries`, its
     section 5), where nothing is cut, so the 1,000,000th code reads `C-1000000`.
   - Only if A14a hasn't merged when part 3 is ready: a simple per-business counter, one row per business, taken
     with an atomic `UPDATE … SET next_value = next_value + 1 … RETURNING` (invariant 6, never read-then-write).
     That is a second small table in A11's migration (see question 6). Gaps don't matter for a party code.

2. **Where is the walk-in party created?** ADR 0006 section 6 (decided on #15) says that when a business is
   created, Organization calls a Party interface that creates it. But a business is created by
   `erp_provisioner`, which may insert only into `business` and `branch` (ADR 0008 test 17). Three options:
   - **A seed** creates it, as the migration owner. That depends on [#31 question 1](https://github.com/munifmubtashim/SaaS-ERP-CRM/pull/31#issuecomment-7060072315), and every new
     business needs the seed run again. `created_by` would be `NULL`.
   - **The app creates it in the business's own scope, on first use** (the first sale or payment that needs a
     walk-in customer), as `erp_app`. `INSERT … ON CONFLICT DO NOTHING` on the partial unique index
     `(business_id) WHERE is_walk_in`, then a read, so two first uses at the same moment still leave exactly one.
     `created_by` would be the user of that request, so the `CHECK` could become a plain `NOT NULL`.
   - **A grant to `erp_provisioner` on `party`.** That would change ADR 0008, which keeps the provisioner to two
     tables. `created_by` would be `NULL` (#27).

   Recommended: the app on first use, with the unique index so each business has exactly one walk-in party.
   Then `created_by` is never `NULL` on `party`, and the `OR is_walk_in` part of the `CHECK` goes. It changes the
   #15 decision, so ADR 0006 section 6 would be updated to match. Your call; if you pick a seed or the grant, the
   `CHECK` stays as written.

3. **`text` with `CHECK`, or a PostgreSQL enum,** for `kind` and `status`? Recommended: `text` with `CHECK`.
   Adding `merged` later is then a constraint swap in a new migration. A new enum value can't be used in the
   same transaction that adds it, and an enum value can never be removed.
4. **Search by name, code and phone.** ADR 0006 section 9 says the list searches all three. A **prefix**
   search (`name ILIKE 'text%'`, which a btree on `(business_id, name)` can use) finds "Abdur" but **not**
   "rahman" in "Abdur Rahman". A **contains** search (`ILIKE '%text%'`) finds both, but no btree index helps
   it, so each search reads all of the business's parties. Recommended for release 1: plain contains search on
   `name`, `code` and `phone_e164`, with no search index, which is fast enough while a business has a few
   thousand parties. Add `pg_trgm` indexes later, when a business grows enough for the search to be slow. Your call.
5. **Idempotency on `POST /v1/parties`.** ADR 0006 section 9 gives it an Idempotency-Key. Should part 4 wait for
   A14 part 2 (#40)? Or should `{ idempotent: true }` be added to the route in a small PR after A14 merges?
   Recommended: add it after, because creating a party moves no money or stock.
6. **One table in A11.** Do you agree that `party_identity`, `party_contact`, `party_address`, `party_group`,
   `credit_hold`, `party_relation` and `party_merge_log` all come later, each with its feature (section 1), and
   not in A11's migration?

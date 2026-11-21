# 0025: Plan for C18, guarantors and party relations

| Field               | Value                                                                  |
| ------------------- | ---------------------------------------------------------------------- |
| Status              | Proposed                                                               |
| Date                | 2026-11-21                                                             |
| Deciders            | Farhan (owner), Munif                                                  |
| Spec / roadmap refs | spec CR-12, S-14; ADR 0006, 0008, 0019, 0022, 0024; plan C18, C19, 1.5 |

## Context

Moto Mart wants a **guarantor** in release 1 (plan 1.5; ADR 0006 order of work, step 9). Plan row C18: "a
relation to a party of another business is refused (composite key); a guarantor is shown on the credit sale".
ADR 0006 section 2 plans `party_relation (party_id, related_party_id, relation)` with relations such as father,
husband and guarantor, kept in one business by the composite key.

Instalment sales (C19, ADR 0027) are the main user: a bike sold on instalments usually has a guarantor.

This plan adds a tenant table and a migration, so CLAUDE.md requires it before code. No code is in this PR.

## Decision

### 1. The table (`party_relation`, Party, `party.prisma`, migration `party_relation`)

| Column             | Notes                                                                               |
| ------------------ | ----------------------------------------------------------------------------------- |
| `id`               | `uuid_v7()`                                                                         |
| `business_id`      | RLS                                                                                 |
| `party_id`         | composite foreign key `(business_id, party_id)` → `party (business_id, id)`         |
| `related_party_id` | composite foreign key `(business_id, related_party_id)` → `party (business_id, id)` |
| `relation`         | `text`, `CHECK (relation IN ('guarantor', 'father', 'mother', 'spouse', 'other'))`  |
| `note`             | text, up to 200 characters                                                          |
| `ended_at`         | null while the relation holds; `ended_by` the same                                  |
| `created_at`       | `updated_at`, `created_by` (the caller), `version`                                  |

- **Direction:** the row reads "`related_party_id` is `party_id`'s `relation`", for example "Karim is Rahim's
  guarantor".
- **Keys:** `CHECK (party_id <> related_party_id)`; one open row per pair and relation: partial unique index
  `(business_id, party_id, related_party_id, relation) WHERE ended_at IS NULL`.
- **Both ends in one business:** the two composite foreign keys make a link to another business's party
  impossible, even through a bug that skips the Manager (ADR 0006 section 2).
- **Never deleted.** A relation is ended: a trigger allows one change only, setting `ended_by` and `ended_at`
  on an open row.
- **RLS and grants** as every tenant table (ADR 0008, #27): forced; `erp_app` policies `TO erp_app` for
  `SELECT`, `INSERT` and `UPDATE`, `UPDATE` only on `ended_by`, `ended_at`, `version`, `updated_at`; owner
  policies `TO CURRENT_USER` for `SELECT`, `INSERT`, `UPDATE`; no `DELETE` for any role; a `BEFORE TRUNCATE`
  trigger. Business-wide, like `party`.
- **Wording stays generic:** no vehicle field. The vehicle pack may require a guarantor for an instalment sale,
  through `IPartyRequirement` (ADR 0006 section 6); the core doesn't.

### 2. Who may be a guarantor

A guarantor is a party of the same business. `party` requires `is_customer OR is_supplier` (ADR 0019), so a
guarantor who never buys would have to be marked as a customer. Open question 1.

The guarantor's NID is optional, as on every party. Requiring it for a guarantor is a pack rule, not core.

### 3. Routes (all `scope: 'tenant'`, each with an isolation case)

| Route                              | Permission           | What it does                                          |
| ---------------------------------- | -------------------- | ----------------------------------------------------- |
| `GET /v1/parties/:id/relations`    | the role's view code | open relations both ways, with each party's name only |
| `POST /v1/parties/:id/relations`   | the role's edit code | adds one (`relatedPartyId`, `relation`, `note`)       |
| `POST /v1/party-relations/:id/end` | the role's edit code | ends it                                               |

"The role's code" follows ADR 0006 section 8 (#52): `party.customer.view` or `.edit` from the customer side,
`party.supplier.view` or `.edit` from the supplier side; a party that is both may be reached from either.

The list returns names and codes only, never the related party's NID or phone. Opening the related party
goes through its own profile route and its own permission.

### 4. On the credit sale

- The sale screen shows the customer's open guarantors when the sale leaves a balance (ADR 0024).
- The invoice doesn't store the guarantor. An instalment plan does (`guarantor_party_id`, ADR 0027), because
  that's where the guarantee applies. Open question 2.

## Tests to write first (run to see them fail)

Real Postgres:

1. A relation between two parties of business X is stored; one whose `related_party_id` belongs to business Y
   fails on the composite foreign key, even as the owner.
2. A party can't be its own guarantor (`CHECK`).
3. A second open `guarantor` row for the same pair is refused; after it's ended, a new one is allowed.
4. Ending changes only `ended_by` and `ended_at`; any other change raises from the trigger. As the owner (no
   superuser, no `BYPASSRLS`), a `DELETE` removes 0 rows and the rows remain; `TRUNCATE` is refused.
5. Isolation: business Y gets 404 on X's party relations by id, on every route.
6. A user without the role's edit code gets 403 on the two write routes: a supplier-only user can't add a
   relation from the customer side, and the other way round.
7. The list response never contains an NID or a phone number of the related party.
8. Tests check only their own fresh ids, never table-wide counts (ADR 0008).

businessLogic:

9. Adding a relation to an inactive party is refused; the walk-in party can't be a guarantor or have one.

## Migration steps (written here, applied in the PR, not now)

1. Merge `main`; tell Munif `party_relation` is in flight.
2. Add `PartyRelation` to `party.prisma`, with two composite relations to `Party` (named relations).
3. `npm run db:migrate:new -- party_relation`; append the RLS, owner policies, the partial unique index, the
   `CHECK`s, the end trigger and the `TRUNCATE` trigger; read every statement.
4. `npm run db:migrate:check`, `db:migrate:deploy` on a throwaway Postgres, `test:integration`, `test:isolation`.

## Size and PR split

| Part | Branch                 | Contents                                                    | Size (approx.) | Needs first               |
| ---- | ---------------------- | ----------------------------------------------------------- | -------------- | ------------------------- |
| 1    | `feat/relation-schema` | shared payload and list shape (both review)                 | ~120           | this ADR                  |
| 2    | `feat/party-relations` | migration, `PartyQuery` methods, Manager, routes, tests 1–9 | ~350           | part 1, A11 parts 3 and 4 |
| 3    | (in C19)               | guarantors on the instalment sale screen                    | in ADR 0027    | part 2                    |

## Blocked by

- A11 (`party`, ADR 0019, #54) parts 3 and 4.
- Open question 1, before part 1.

## Consequences

- **Easier:** guarantors, family links and later relation kinds are rows, not columns.
- **Harder:** a guarantor-only person must exist as a party (question 1).
- **Keep true:** both ends always in one business; a relation is ended, never deleted.
- **Undo:** before go-live, drop `party_relation` in a new migration.

## Open questions for Munif

1. **Guarantor who never buys:** `party` requires `is_customer OR is_supplier`. Mark the guarantor as a
   customer, or add an `is_guarantor` role to `party` (a shared schema change and an A11 change)? Recommended:
   mark as a customer in release 1; the customer list can filter out parties with no sales later.
2. **Where the guarantee lives:** on the instalment plan (ADR 0027) rather than on the invoice? Recommended: yes.
3. **Ending a guarantor while an instalment plan names them:** an active plan (ADR 0027) keeps its own
   `guarantor_party_id`. Refuse to end the relation while such a plan is active, or allow it and show the plan's
   guarantor as "relation ended"? Recommended: refuse with `409 CONFLICT`, field code `relation.in_use`, until
   the plan is completed or cancelled.
4. **Relation kinds:** is `guarantor`, `father`, `mother`, `spouse`, `other` enough for release 1 (ADR 0006 lists
   father, husband, guarantor)? Recommended: yes, with `spouse` instead of `husband`, so the word stays neutral.

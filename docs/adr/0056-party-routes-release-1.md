# 0056: The party routes for release 1 (ADR 0019 part 4)

| Field               | Value                                                                        |
| ------------------- | ---------------------------------------------------------------------------- |
| Status              | Proposed                                                                     |
| Date                | 2026-11-25                                                                   |
| Deciders            | Farhan (owner), Munif (reviews the shared part)                              |
| Spec / roadmap refs | spec CR-01, CR-02, C-01; ADR 0006 sections 8 and 9, 0019 section 5, 0055; F2 |

## Context

ADR 0019 plans the party routes (part 4) and their tests (15 to 19). ADR 0055 (#204) gives every business its
walk-in party and its `party_code` series. What was still missing on the backend tip (#195) on 25 Nov:

- no party permission codes in `shared/src/utils/permissions.ts` (ADR 0006 section 8 lists them);
- no create or update payload in `party.schema.ts` (ADR 0019 part 1);
- `PartyManager` (#194) creates, edits, deactivates and checks a party is active, but has no list, no duplicate
  check, and takes `code` from its input instead of the series;
- routes can check one permission code (ADR 0033), but the per-kind rule depends on the body.

## Decision

### 1. Three draft PRs, stacked

| PR  | Branch                    | Contents                                                                                                           |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| A   | `feat/party-contract`     | shared, both reviewers: permission codes, payloads, the duplicate field code                                       |
| B   | `feat/party-manager-list` | `PartyQuery` list and `findByPhones`, `PartyManager` list, get, duplicate check, code from series, per-kind checks |
| C   | `feat/party-routes`       | `PartyController`, `PartyRoutes`, an isolation case per route, ADR 0019 tests 15 to 19                             |

A branches from `feat/party-walk-in` (#204) with `feat/party-manager-split` (#194) merged in, so its diff holds
#194's until #194 merges. B stacks on A, C on B.

### 2. Permission codes (PR A)

Release 1 adds only the codes its routes use, with ADR 0006's default mapping:

| Code                                             | Owner | Business Manager | Branch Manager | Accountant | Cashier |
| ------------------------------------------------ | ----- | ---------------- | -------------- | ---------- | ------- |
| `party.customer.view`, `party.supplier.view`     | yes   | yes              | yes            | yes        | yes     |
| `party.customer.create`, `party.supplier.create` | yes   | yes              | yes            | yes        | yes     |
| `party.customer.edit`                            | yes   | yes              | yes            | yes        | no      |
| `party.customer.deactivate`                      | yes   | yes              | no             | yes        | no      |

Merge, import, NID, credit and the supplier edit and deactivate codes come with their features.

### 3. Payloads (PR A)

- `createPartySchema`: name, nameBn (null when blank), kind, isCustomer, isSupplier, phone, altPhone, email,
  address, area, creditLimit, payTermDays, and `confirmDuplicate` (default `false`). No id, businessId, code,
  status, version, createdBy or timestamps. Phones go through `toE164` in the schema, so form and API agree.
- `updatePartySchema`: the same editable fields, all optional, plus the `version` read and `confirmDuplicate`.
- **Duplicate phone:** `409 CONFLICT`, one field error per matching active party of the business:
  `{ path: 'phone' | 'altPhone', code: 'party.possible_duplicate', message: '<code> <name>' }`. The error shape
  stays `{code, message, fields[], requestId}`; no id, and never the NID. `confirmDuplicate: true` saves anyway.

### 4. Routes (PR C), all `scope: 'tenant'`

| Route                             | Permission                  | Notes                                           |
| --------------------------------- | --------------------------- | ----------------------------------------------- |
| `GET /v1/parties`                 | `party.customer.view`       | cursor; contains-search on name, code and phone |
| `GET /v1/parties/:id`             | `party.customer.view`       |                                                 |
| `POST /v1/parties`                | `party.customer.create`     | a supplier too needs `party.supplier.create`    |
| `PATCH /v1/parties/:id`           | `party.customer.edit`       | `version` required                              |
| `POST /v1/parties/:id/deactivate` | `party.customer.deactivate` | the walk-in party can't be deactivated          |

- They are the customer routes: a supplier-only party is not found through them.
- Another business's id is `404`, never `403` (RLS hides it).
- No response carries a `nid`, `nid_ciphertext` or `nid_hash` key.
- No `Idempotency-Key` yet (ADR 0019 question 5): creating a party moves no money or stock.
- The code comes from `INumberSeries.next('party_code', null)`: `C-000001`, `C-000002`, …

### 5. Tests to write first

PR A: the codes and their defaults match section 2, and Owner holds every code; the payloads refuse an id,
businessId, code, status or createdBy; phones normalise; `updatePartySchema` needs `version`.
PR B (fake Query and series): ADR 0019 tests 10 to 13, the duplicate field errors, the code from the series, a
supplier create without `party.supplier.create` refused. PR B (real Postgres): list, search, cursor, `findByPhones`.
PR C: ADR 0019 tests 15 to 19, an isolation case per route.

## Consequences

- **Easier:** the customer screens (#33, #51) and the seed (F6) get real routes in release 1.
- **Harder:** suppliers wait for their own routes.
- **Undo:** remove the routes; the codes stay harmless.

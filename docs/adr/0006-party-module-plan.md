# 0006: Party module plan (customers and suppliers)

| Field               | Value                                                                                                                                                            |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status              | **Proposed**                                                                                                                                                     |
| Date                | 2026-11-17                                                                                                                                                       |
| Deciders            | Farhan (owner), Munif                                                                                                                                            |
| Spec / roadmap refs | spec O-01, C-01, S-01, S-12, S-15, A-06, A-07, A-21, A-22, CR-01, CR-02, CR-06, import (spec section 2); roadmap 4.2, 5.3, Phase 1; ADR 0001 rows 1, 2; ADR 0005 |

## Context

Party holds every customer and supplier. Phase 1's first live workflow is **customer dues and daily
closing**, so Party, the customer profile, the dues list and "record a payment" are needed in Phase 1
(roadmap section 11). The plan touches **tenancy** (new tenant tables), **permissions** (new permission codes
and a restricted field) and **migrations**, so CLAUDE.md requires an agreed plan before any code.

The inputs that shape it:

- **Legal entity (ADR 0001 row 1, accepted).** Organization > Legal entity > Business > Branch. Books are per
  business, and each business belongs to one legal entity.
- **National ID (ADR 0001 row 2, accepted; CLAUDE.md).** NID is stored on Party only, optional, encrypted at
  rest, visible only to permitted roles, and every view is logged. The vehicle pack may only make it
  required. Duplicate detection checks phone and NID (CR-02).
- **Tenant scope (ADR 0005, merged in PR #3 on 17 Nov; status Proposed).** It settles these points
  for Party:
  - Party is **business-owned**, keyed on `business_id` (ADR 0005 Context and Answers, question 1).
  - Every request runs in one transaction through `BaseQuery`. Every **write** runs with exactly one active
    business. Several businesses are allowed only on routes marked `{ readOnly: true }`.
  - `app.branch_ids` is always set. Branch-scoped tables also filter on `branch_id`.
  - The audit record of a **denied** action is saved in a second short scoped transaction after the rollback.
  - Until the worker exists, big operations stay in the request with a **size cap**. An over-cap request is
    refused with the one shared over-limit error. Party merge is named as one of them.
  - No background work starts from inside a request.
  - ADR 0005 leaves two things to this ADR: the details of merge, duplicates and NID, and whether Party groups
    or areas are organization-level (its Q5, to settle before M2).
- **F1a is merged (PR #7).** `shared/src/schemas/party.schema.ts` already has the read shapes (`partySchema`,
  `partyListItemSchema`, `partyListQuerySchema`) and `shared/src/utils/pagination.ts` has cursor pagination.
  This plan must agree with them, or change them in a shared PR.
- **Ledger is the truth (invariant 1).** A party's balance comes from journal lines, never from a stored
  field. Opening balances are posted as journals (roadmap 5.3).

## Decision

### 1. Which level does a party belong to: business

A party belongs to **one business**: `party.business_id`, with RLS on `business_id = ANY (app_business_ids())`
like every other business table. This is the answer recorded in ADR 0005.

- Books, invoices, dues and credit limits are all per business, so the customer record is too.
- The same person buying from two businesses of the same owner gets two party records, one per business.
  Each business's dues stay separate and correct.
- NID protection stays simple: a user can see only the NIDs of businesses they are scoped to.
- **No `legal_entity_id` on party.** The legal entity is reached through `business.legal_entity_id`. A
  statement or invoice prints the legal entity's name and BIN from there.
- **The business of a new party comes from the scope**, never from the request body. A write runs with exactly
  one active business (ADR 0005), and the Manager uses that one. The create and edit payloads have no
  `businessId` field.
- **Branch: Party is business-wide, not branch-scoped.** Both branches of a business serve the same customers, so
  `party` has no `branch_id` and its policy checks `business_id` only. A cashier of branch 1 can find a customer
  first served in branch 2. That is intended. The branch limit of spec C-01 applies to the documents
  (invoices, receipts, payments), which are branch-scoped in their own modules. `created_branch_id` records
  where the record was made, for reports only.
- **Party groups and areas are business-level too** (ADR 0005 Q5). Each business sets its own groups (retail,
  dealer) and areas. No Party table is organization-level.

Rejected: **one party per organization** shared by all its businesses. It saves duplicate entry, but it lets a
user of business A see a customer of business B (and their NID), and it mixes the books of different legal
entities in one record. If the owner later wants a shared customer view, it comes from an organization-level
`report_snapshot` (roadmap 4.2), not from a shared table. See open question 1.

### 2. Tables (all in `dal/prisma/schema/party.prisma`)

All tables: UUID v7 `id`, `business_id`, `created_at`, `updated_at` (UTC), `created_by`, RLS **enabled and
forced**, singular names. Money is `numeric(18,2)` and a string in the API.

**No cross-business links, enforced by the database.** `party` has a unique key on `(business_id, id)`. Every
table that points at a party uses a composite foreign key `(business_id, party_id)` → `party (business_id, id)`.
That covers `merged_into_id`, `related_party_id` and the child tables. So a row can never point at a party of
another business, even through a bug that skips the Manager. Other modules (Sales, Purchase, Accounting) use the
same composite key when they reference a party.

| Table             | Fields                                                                                                                                                                                                                                                                                                                      | Notes                                                                                            |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `party`           | `code`, `name`, `name_bn`, `kind` (person, company), `is_customer`, `is_supplier`, `phone_e164`, `alt_phone_e164`, `email`, `address`, `area`, `bin`, `party_group_id`, `credit_limit`, `pay_term_days`, `status` (active, inactive, merged), `merged_into_id`, `is_walk_in`, `assigned_to`, `created_branch_id`, `version` | `code` unique per business. At least one of `is_customer`, `is_supplier`. **No balance column.** |
| `party_identity`  | `party_id` (unique), `nid_ciphertext`, `nid_key_version`, `nid_hash`, `nid_last4`                                                                                                                                                                                                                                           | The NID, kept apart from `party` so a list query can never select it by accident. See section 3. |
| `party_contact`   | `party_id`, `name`, `role`, `phone_e164`, `email`                                                                                                                                                                                                                                                                           | Contact persons for companies.                                                                   |
| `party_address`   | `party_id`, `label`, `address`, `area`, `is_default`                                                                                                                                                                                                                                                                        | Billing and delivery. One default per party (partial unique index).                              |
| `party_group`     | `name`, `discount_pct`, `price_list_id`                                                                                                                                                                                                                                                                                     | Retail, dealer, corporate. Business-level. `price_list_id` waits for Product.                    |
| `party_relation`  | `party_id`, `related_party_id`, `relation` (father, husband, guarantor)                                                                                                                                                                                                                                                     | Same business by the composite key. P1: build after the Phase 1 gate.                            |
| `party_merge_log` | `kept_id`, `merged_id`, `merged_by`, `merged_at`, `snapshot` (JSONB of the merged record, NID excluded), `undone_at`, `undone_by`                                                                                                                                                                                           | Append-only (trigger). See section 5.                                                            |
| `credit_hold`     | `party_id`, `reason`, `set_by`, `set_at`, `released_by`, `released_at`                                                                                                                                                                                                                                                      | Blocks credit sales. Used by Sales (S-12).                                                       |

**Area is free text in v1** (`area`, up to 100 characters), as in the merged F1a schema. An `area` table
(business-level) comes only if collection routes or area reports need fixed values. See open question 6.

**`merged` status:** the F1a schema allows only `active` and `inactive`. `merged` is added to
`partyStatusSchema` in the same shared PR as the merge work (order of work, step 5).

**Not in Party:**

- balance, dues and the opening balance are journal lines with `party_id` (Accounting, Munif);
- chassis, engine number, BRTA and registration are in the Vehicle pack (spec O-11);
- leads are in Crm.

### 3. National ID

- **Optional on Party.** The vehicle pack makes it required for a vehicle sale (section 6), and nothing else may.
- **Encrypted in the application, not in SQL.** AES-256-GCM, with a random nonce per value. The key comes
  from the environment (`PARTY_NID_KEY`, local placeholder in `.env.example`) and never reaches the database.
  So the plain NID never appears in SQL text, query logs or a database dump. `nid_key_version` allows key
  rotation.
- **Duplicate check without decrypting:** `nid_hash` = HMAC-SHA256 of the normalised NID (digits only)
  with a second key (`PARTY_NID_HASH_KEY`). Index `(business_id, nid_hash)`. Not unique: a duplicate is a
  warning (CR-02).
- **`nid_last4`** is shown in lists and on the profile without a permission, for example "NID ••••1234".
- **Where the code lives:** an `INidCipher` interface in `businessLogic/src/contracts/`, implemented by
  `AesGcmNidCipher` in businessLogic (it uses `node:crypto`, so not in `shared`, which the frontend imports).
  It is built in `createManagers`. The dal stores and returns only ciphertext and the hash.
- **Viewing the full NID** is its own action, `GET /v1/parties/:id/national-id`, with permission
  `party.nid.view`. Every successful view writes an `audit_log` row (`party.nid.view`, actor, party id,
  request id) in the request transaction. The Controller returns `{status, body}`, so the NID is sent only
  after that row commits (ADR 0005).
- **A denied view** (no permission) writes its `audit_log` row through ADR 0005's second short scoped
  transaction, opened after the request transaction has rolled back. So the attempt is kept even though the
  request failed.
- **Never in:** list responses, search results, the merge snapshot, exports, Pino logs (a redact rule for
  `nid`, `national_id`, `nidPlain`), error messages or test fixtures with real-looking numbers.
- **Editing the NID** needs `party.nid.edit`, and the change is logged (old and new `nid_last4` only).

### 4. Phone and duplicate detection (CR-02)

- **Normalise** every phone number to E.164 before storing it: `01712345678`, `+8801712345678` and
  `8801712345678` all become `+8801712345678`. A Bangladesh mobile number must match `+8801[3-9]` plus 8
  digits. Other numbers are allowed with a country code. The normaliser lives in `shared/src/utils` so the
  form and the API agree. (F1a only checks the stored form with `z.e164()`; the normaliser comes with F2.)
- **On create or edit**, the Manager looks for an active party in the **same business** with the same phone,
  alt phone or `nid_hash`. If found, the API returns `409 PARTY_POSSIBLE_DUPLICATE` listing the matching
  party ids, names and the field that matched (never the NID). The user can open the existing record or
  resend with `confirmDuplicate: true`.
- The check **never looks outside the active business**: the write runs with one business, and RLS holds it
  there. So it cannot reveal that a person is a customer of another business.
- Phones are personal data: logs show only the last 3 digits.

### 5. Merge (CR-02)

- Needs `party.merge`. Both parties must be in the same business (the composite key makes any other case
  impossible), active, and not walk-in.
- **Size cap (ADR 0005, agreed on #3 on 17 Nov).** Before changing anything, the Manager counts the documents and
  journal lines linked to the merged party. Above the cap, the merge is refused with the shared over-limit
  error, whose message tells the user what to do. The cap value is set when merge is built and checked against
  the Phase 2 measurements. When the worker lands, a large merge becomes a job and the cap can be raised.
- **Locking (invariant 6).** The merge locks both party rows with `SELECT ... FOR UPDATE`, in id order so two
  merges cannot deadlock. A second merge of the same party waits, then finds it already merged and fails
  with `409`.
- **Posted journal lines are never rewritten** (invariant 2). The merged party gets `status = merged` and
  `merged_into_id = kept_id`. Ledgers, dues and profile queries read "this party and every party merged into it".
  Unposted drafts that point at the merged party are moved to the kept party.
- One transaction: the merge log row, the status change and the draft moves.
- **Undo** is allowed while no new document has been posted against the kept party since the merge. It
  restores the snapshot and sets `undone_at`. After that, a merge can only be corrected by hand, and the
  correction is logged.
- Chains are flattened: merging A into B, then B into C, sets A's `merged_into_id` to C.

### 6. Required fields per sale type (vehicle pack hook, S-01)

- Party exposes `IPartyRequirement` (open/closed rule): `check(party): MissingField[]`.
- Core registers none. The Vehicle pack registers `VehicleSaleRequirement` (name, phone, NID, address).
- Sales calls the requirements for the invoice's lines before posting. The core never names a vehicle field.
- **Walk-in:** one system party per business (`is_walk_in = true`, created with the business). It cannot have
  a credit limit, dues or an NID, and cannot be merged or deactivated. A vehicle sale to it fails the vehicle
  requirement.

### 7. Lifecycle

- **Never deleted.** A party with any document or journal line is deactivated (`status = inactive`). It
  keeps its history, and it cannot be picked on a new document. A party with no references at all can be
  deactivated the same way. There is no hard delete in v1.
- **Concurrency:** `version` column. An edit sends the version it read. A stale version returns `409 CONFLICT`.
- **Codes** come from `number_series` (`doc_type = party`), gap-free with a row lock (roadmap 5.2).

### 8. Permissions

Permission codes (roadmap 5.1 `permission`, seeded):

| Code                | What it allows                                        |
| ------------------- | ----------------------------------------------------- |
| `party.view`        | List, search, open a profile (NID masked)             |
| `party.create`      | Create a party                                        |
| `party.edit`        | Edit details, contacts, addresses                     |
| `party.deactivate`  | Deactivate or reactivate                              |
| `party.merge`       | Merge and undo a merge                                |
| `party.nid.view`    | See the full NID (logged)                             |
| `party.nid.edit`    | Add or change the NID (logged)                        |
| `party.credit.edit` | Change credit limit, pay terms, set or release a hold |
| `party.import`      | Import customers and suppliers                        |

Default role mapping, **provisional until ADR 0001 row 8 (role names) is accepted**:

| Role             | view | create | edit | deactivate | merge | nid.view | nid.edit | credit.edit | import |
| ---------------- | ---- | ------ | ---- | ---------- | ----- | -------- | -------- | ----------- | ------ |
| Owner            | yes  | yes    | yes  | yes        | yes   | yes      | yes      | yes         | yes    |
| Business Manager | yes  | yes    | yes  | yes        | yes   | yes      | yes      | yes         | yes    |
| Branch Manager   | yes  | yes    | yes  | no         | no    | yes      | yes      | no          | no     |
| Accountant       | yes  | yes    | yes  | yes        | no    | no       | no       | yes         | yes    |
| Cashier          | yes  | yes    | no   | no         | no    | no       | yes      | no          | no     |

A cashier can **enter** an NID at a vehicle sale (`nid.edit`) but cannot read one back (`nid.view`).

### 9. API (all `scope: 'tenant'`, each with an isolation case)

`GET /v1/parties` (cursor, search by name, code, phone; filter customer or supplier, status) ·
`POST /v1/parties` (Idempotency-Key) · `GET /v1/parties/:id` · `PATCH /v1/parties/:id` ·
`GET /v1/parties/:id/national-id` · `PUT /v1/parties/:id/national-id` ·
`POST /v1/parties/:id/deactivate` · `POST /v1/parties/:id/merge` · `POST /v1/parties/merges/:id/undo` ·
`POST /v1/parties/:id/credit-holds` · `POST /v1/credit-holds/:id/release` · contacts and addresses as
sub-resources. Ledger and dues routes belong to Accounting (A-06, A-21) and read `party_id`.

- **The list** uses `partyListQuerySchema` and `cursorPageSchema` from F1a (cursor capped at 512 characters).
- **Every Party route runs with one active business.** None is marked `{ readOnly: true }` in v1. A
  cross-business customer view, if the owner wants one, is a report (section 1), not a Party route.
- **Controllers return `{status, body}`** (ADR 0005), so a response goes out only after the commit.
- **Idempotency-Key** on `POST /v1/parties`: the key record is written in the request transaction (ADR 0005
  Q6), so a rollback removes it and a retry after a lost response returns the first party.

### 10. Import

- The importer (Munif, Phase 1) calls Party's validation for each row. The same rules apply as for a
  form: phone normalised, duplicates flagged, NID encrypted on the way in.
- **Size cap.** Until the worker exists, an import runs inside the request with a row cap and is refused above
  it with the shared over-limit error (ADR 0005). It never starts background work from inside the request.
- Rejected rows are listed with reasons.
- Opening balances become journals through Accounting, never a Party field.
- Real exports stay in `data/real/`. Fixtures use the anonymiser.

### 11. Tests to write first

Unit (businessLogic, shared):

1. The phone normaliser accepts the three Bangladesh forms and rejects `0171234567` (too short) and
   `01212345678` (bad operator).
2. `AesGcmNidCipher` round-trips the NID, gives different ciphertext for the same NID twice, gives the same
   hash, and fails on a tampered ciphertext.
3. `VehicleSaleRequirement` reports a missing NID, address or phone; core with no requirements reports nothing.
4. Merge rules: walk-in rejected, chain flattened, over the cap refused with the over-limit error.

Integration (real Postgres, as `erp_app`):

5. **Isolation:** a user of business X cannot list, read, edit, merge or guess the id of a party of business
   Y (404, not 403). This includes `national-id` routes.
6. **Duplicate check does not leak:** the same phone in business Y raises no warning in business X.
7. **Cross-business links are refused by the database:** inserting a `party_relation`, `party_contact` or
   `merged_into_id` that points at a party of another business fails on the composite foreign key, even
   as the table owner.
8. **A new party goes to the active business:** the create payload has no `businessId`, and the created row
   has the scope's one business.
9. **Business-wide by design:** a user scoped to branch 1 can find a party created in branch 2 of the same
   business, and none of another business.
10. The NID column holds ciphertext: a raw `SELECT` on `party_identity` never contains the plain digits.
11. `GET /v1/parties` and `GET /v1/parties/:id` never contain `nid_ciphertext`, `nid_hash` or the full NID.
12. `national-id` view: with permission it returns the NID **and** writes one `audit_log` row. Without it, 403,
    no NID, and one `audit_log` row for the denied attempt, kept although the request rolled back.
13. Pino redaction: a request that carries an NID writes no NID and no full phone to the log (capture the
    log stream).
14. Stale `version` on edit returns 409. Two parallel creates with one Idempotency-Key create one party.
15. Merge keeps posted journal lines untouched (row count and hash before and after), moves drafts, and
    the merged party's ledger shows under the kept party. Undo restores it.
16. Two parallel merges of the same party: one succeeds, the other gets 409, and there is one merge log row.
17. A deactivated party cannot be picked on a new document. The walk-in party cannot be deactivated, merged
    or given credit.
18. RLS: a query on `party` outside a tenant scope fails (ADR 0005 proof pattern).

### 12. Order of work (each a separate PR, under ~400 lines)

ADR 0005 is merged (#3). The migration still waits for the RLS functions (`app_business_ids()`, part
1b-iii) and the organization tables (M2), because `party` references `business`.

1. ~~Shared read shapes and cursor pagination~~: **done in F1a (#7)**.
2. Frontend F1b: party list and profile against mock data (CR-01 parts that exist), in en and bn.
3. Shared: phone normaliser, create and edit payloads (no `businessId`) (both reviewers, merged first).
4. Migration: `party`, `party_identity`, `party_group`, `party_contact`, `party_address`, `party_merge_log`,
   `credit_hold`, with RLS, the composite keys and the append-only trigger (merge `main` and tell Munif first).
5. Party Query, Manager, Controller: create, read, list, edit, deactivate, with isolation cases (F2).
6. NID: cipher, `party_identity`, view and edit routes, audit (including denied views), log redaction.
7. Duplicate detection and merge, with the size cap and `merged` added to `partyStatusSchema`.
8. After the Phase 1 gate: `party_relation`, credit limit and BIN rules (S-15), `IPartyRequirement` wiring
   with Sales.

## Consequences

- One customer buying from two businesses is entered twice. That's the cost of keeping books and NIDs
  per business.
- Any user of a business can find every party of that business, whatever their branch. Branch limits come from
  the branch-scoped documents, not from Party.
- Every module that references a party carries `business_id` and uses the composite key. That is one more
  column on their tables, and it makes cross-business links impossible.
- Ledger queries must follow `merged_into_id`. Accounting's party ledger and dues queries need that rule
  (to agree with Munif).
- Large merges and imports are refused above their caps until the worker exists.
- A lost `PARTY_NID_KEY` makes every NID unreadable. Production key storage and backup must be planned with
  the deploy (open question 3).
- Undoing this plan: everything sits in Party's own tables and routes. Moving to organization-level parties later
  means a data migration that groups per-business records, with the per-business ledgers left unchanged.

## Open questions

1. **Owner:** should one customer be shared across the owner's businesses? ADR 0005 already keys Party on
   `business_id`. This asks only whether the owner needs a shared view, which would be a report.
2. **Munif (Accounting):** do party ledger and dues queries follow `merged_into_id`, or should merge be
   blocked once the merged party has posted journal lines?
3. **Munif (deploy):** where does `PARTY_NID_KEY` live in production (secret manager), and who can read it?
4. **Owner:** retention: when a customer asks to be forgotten, do we blank name, phone and NID and keep
   the ledger lines? Not in v1 unless the owner needs it.
5. **Both:** confirm the role table once ADR 0001 row 8 (role names) is decided.
6. **Owner:** is a free-text area enough, or does the dealership collect dues by fixed areas or routes? A fixed
   list would mean an `area` table (business-level).
7. **Both:** Munif's other modules reference parties. Do they accept the composite `(business_id, party_id)`
   foreign key?

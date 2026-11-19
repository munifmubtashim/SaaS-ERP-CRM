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
same composite key when they reference a party (decided on #15: Munif's modules use it too).

| Table             | Fields                                                                                                                                                                                                                                                                                                                      | Notes                                                                                            |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `party`           | `code`, `name`, `name_bn`, `kind` (person, company), `is_customer`, `is_supplier`, `phone_e164`, `alt_phone_e164`, `email`, `address`, `area`, `bin`, `party_group_id`, `credit_limit`, `pay_term_days`, `status` (active, inactive, merged), `merged_into_id`, `is_walk_in`, `assigned_to`, `created_branch_id`, `version` | `code` unique per business. At least one of `is_customer`, `is_supplier`. **No balance column.** |
| `party_identity`  | `party_id` (unique), `nid_ciphertext`, `nid_key_version`, `nid_hash`, `nid_last4`                                                                                                                                                                                                                                           | The NID, kept apart from `party` so a list query can never select it by accident. See section 3. |
| `party_contact`   | `party_id`, `name`, `role`, `phone_e164`, `email`                                                                                                                                                                                                                                                                           | Contact persons for companies.                                                                   |
| `party_address`   | `party_id`, `label`, `address`, `area`, `is_default`                                                                                                                                                                                                                                                                        | Billing and delivery. One default per party (partial unique index).                              |
| `party_group`     | `name`, `discount_pct`, `price_list_id`                                                                                                                                                                                                                                                                                     | Retail, dealer, corporate. Business-level. `price_list_id` waits for Product.                    |
| `party_relation`  | `party_id`, `related_party_id`, `relation` (father, husband, guarantor)                                                                                                                                                                                                                                                     | Same business by the composite key. Release 1 (guarantor, CR-12): order of work, step 9.         |
| `party_merge_log` | `kept_id`, `merged_id`, `merged_by`, `merged_at`, `snapshot` (JSONB of the merged record, NID excluded), `undone_at`, `undone_by`                                                                                                                                                                                           | Append-only (trigger). See section 5.                                                            |
| `credit_hold`     | `party_id`, `reason`, `set_by`, `set_at`, `released_by`, `released_at`                                                                                                                                                                                                                                                      | Blocks credit sales. Used by Sales (S-12).                                                       |

**`assigned_to` points at `staff`, not `app_user` (ADR 0008, agreed on #21).** A salesperson can be a staff
record with no login; `staff.user_id` links a login when one exists. It uses the composite key
`(business_id, assigned_to)` → `staff (business_id, id)`, so a party can never be assigned to another
business's staff.

**`created_by` is a plain `uuid` with no foreign key (ADR 0008, agreed on #21).** A foreign key only in raw
SQL fails `db:migrate:check`, and a Prisma relation to `app_user` would let a Query `include` the whole user
row, which ADR 0008 test 15 forbids. `app_user` rows are never deleted. The Manager sets `created_by` from the
logged-in user, never from the request body (ADR 0008 test 16, with a Party case for every create route).

**Order:** the first Party migration creates `created_by` and `assigned_to` as plain `uuid` columns, so it
waits only for the organization tables (A3). A small follow-up migration adds only the `assigned_to` foreign
key and its Prisma relation (with the back-relation on `staff`) right after the access tables (A4) merge.

**Area is free text in v1** (`area`, up to 100 characters), as in the merged F1a schema. An `area` table
(business-level) comes only if collection routes or area reports need fixed values. See open question 4.

**`merged` status:** the F1a schema allows only `active` and `inactive`. `merged` is added to
`partyStatusSchema` in the same shared PR as the merge work (order of work, step 8).

**Not in Party:**

- balance, dues and the opening balance are journal lines with `party_id` (Accounting, Munif);
- chassis, engine number, BRTA and registration are in the Vehicle pack (spec O-11);
- leads are in Crm.

### 3. National ID

- **Optional on Party.** The vehicle pack makes it required for a vehicle sale (section 6), and nothing else may.
- **Encrypted in the application, not in SQL.** AES-256-GCM, with a random nonce per value. The key
  (`PARTY_NID_KEY`) never reaches the database. So the plain NID never appears in SQL text, query logs or a
  database dump. `nid_key_version` allows key rotation.
- **Where the keys live (decided on #15).** `PARTY_NID_KEY` and `PARTY_NID_HASH_KEY` are kept in the hosting
  platform's secrets, with local placeholders in `.env.example`. They are read and checked only in
  `api/config/env.ts` and passed to `createManagers` like the database URL. businessLogic never reads
  `process.env`. The keys are backed up separately from the database, so a database backup alone can't
  decrypt an NID.
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
- **Entering the NID when creating a party** needs only the create code for its kind
  (`party.customer.create` or `party.supplier.create`): the create payload may carry it.
- **Adding or changing the NID of an existing party** needs `party.nid.edit`, and the change is logged (old
  and new `nid_last4` only).

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

**Design only for now (decided on #15).** Merge and undo are built after 29 Nov. Before then, F2 needs only
the duplicate-phone warning (section 4).

- Needs the merge code for the role it is done in (`party.customer.merge` or `party.supplier.merge`;
  section 8). Both parties must be in the same business (the composite key makes any other case
  impossible), active, and not walk-in.
- **Size cap (ADR 0005, agreed on #3 on 17 Nov).** Before changing anything, the Manager counts the documents and
  journal lines linked to the merged party. Above the cap, the merge is refused with the shared over-limit
  error, whose message tells the user what to do. The cap value is set when merge is built and checked against
  the Phase 2 measurements. When the worker lands, a large merge becomes a job and the cap can be raised.
- **Locking (invariant 6).** The merge locks both party rows with `SELECT ... FOR UPDATE`, in id order so two
  merges cannot deadlock. A second merge of the same party waits, then finds it already merged and fails
  with `409`.
- **Posted journal lines are never rewritten** (invariant 2). The merged party gets `status = merged` and
  `merged_into_id = kept_id`.
- **Ledgers follow the merge (decided on #15).** Merge is not blocked by posted journal lines. One dal helper
  resolves a party to "this party and every party merged into it", and every ledger, dues and profile query
  uses that helper, so they all apply the same rule.
- Unposted drafts that point at the merged party are moved to the kept party.
- One transaction: the merge log row, the status change and the draft moves.
- **Undo** is allowed while no new document has been posted against the kept party since the merge. It
  restores the snapshot and sets `undone_at`. After that, a merge can only be corrected by hand, and the
  correction is logged.
- Chains are flattened: merging A into B, then B into C, sets A's `merged_into_id` to C.

**Open until merge is built (Munif's review comments on #15):**

- **Moving other modules' drafts.** Party must not write Sales or Purchase tables. Each module that holds
  drafts provides an interface that moves its own drafts, and the merge calls those interfaces.
- **Undo in full.** It must say whether the moved drafts move back, and what happens to a flattened chain
  (A into B, then B into C). The "nothing posted against the kept party since the merge" check takes the same
  row locks as the merge.

### 6. Required fields per sale type (vehicle pack hook, S-01)

- Party exposes `IPartyRequirement` (open/closed rule): `check(party): MissingField[]`.
- Core registers none. The Vehicle pack registers `VehicleSaleRequirement` (name, phone, NID, address).
- Sales calls the requirements for the invoice's lines before posting. The core never names a vehicle field.
- **Walk-in:** one system party per business (`is_walk_in = true`). It cannot have a credit limit, dues or an
  NID, and cannot be merged or deactivated. A vehicle sale to it fails the vehicle requirement.
- **How the walk-in party is created (decided on #15).** When a business is created (M2, Organization),
  Organization calls a Party interface that creates the walk-in party. Organization never writes Party's
  tables. The interface lives in `businessLogic/src/contracts/`, Party's Manager satisfies it, and
  `createManagers` passes it to Organization's Manager.

### 7. Lifecycle

- **Never deleted.** A party with any document or journal line is deactivated (`status = inactive`). It
  keeps its history, and it cannot be picked on a new document. A party with no references at all can be
  deactivated the same way. There is no hard delete in v1.
- **Concurrency:** `version` column. An edit sends the version it read. A stale version returns `409 CONFLICT`.
- **Codes** come from `number_series` (`doc_type = party`), gap-free with a row lock (roadmap 5.2).

### 8. Permissions

Permission codes (roadmap 5.1 `permission`, seeded). Every code has three parts, `module.entity.action`
(ADR 0008 section 3). Customers and suppliers get separate codes, because Sales and CRM staff and Purchase
and Accounting staff are different roles:

| Code                                                     | What it allows                                        |
| -------------------------------------------------------- | ----------------------------------------------------- |
| `party.customer.view`, `party.supplier.view`             | List, search, open a profile (NID masked)             |
| `party.customer.create`, `party.supplier.create`         | Create a party of that kind, including its NID        |
| `party.customer.edit`, `party.supplier.edit`             | Edit details, contacts, addresses                     |
| `party.customer.deactivate`, `party.supplier.deactivate` | Deactivate or reactivate                              |
| `party.customer.merge`, `party.supplier.merge`           | Merge and undo a merge                                |
| `party.customer.import`, `party.supplier.import`         | Import parties of that kind                           |
| `party.nid.view`                                         | See the full NID (logged)                             |
| `party.nid.edit`                                         | Add or change an existing party's NID (logged)        |
| `party.credit.edit`                                      | Change credit limit, pay terms, set or release a hold |

The NID and credit codes stay per party, not per kind: they already have three parts and protect one field
whatever the kind.

**A party that is both a customer and a supplier:**

- **Read:** visible with either view code. A list or search returns only the parties whose kind the user
  may view; a supplier-only user never sees customer-only parties.
- **Actions:** each action needs the code for the role it is done in. The request says which role (the
  customer or the supplier screen): from the customer side it needs `party.customer.<action>`, from the
  supplier side `party.supplier.<action>`. Adding the other role to an existing party needs that role's
  create code (a customer becomes also a supplier with `party.supplier.create`).
- Name, phones and addresses are one record, so an edit made from either side shows on both.

Default role mapping, **provisional until ADR 0001 row C7 (the five roles) is accepted**. Each column is the
action's code for both kinds (for example "create" = `party.customer.create` and `party.supplier.create`),
the same grants as before the per-kind split. This ADR owns Party's codes and their default mapping (ADR 0008
open question 2, decided 20 Nov), so splitting a role by kind (for example a customer-only Cashier) is a
change to this table, not to ADR 0008:

| Role             | view | create | edit | deactivate | merge | nid.view | nid.edit | credit.edit | import |
| ---------------- | ---- | ------ | ---- | ---------- | ----- | -------- | -------- | ----------- | ------ |
| Owner            | yes  | yes    | yes  | yes        | yes   | yes      | yes      | yes         | yes    |
| Business Manager | yes  | yes    | yes  | yes        | yes   | yes      | yes      | yes         | yes    |
| Branch Manager   | yes  | yes    | yes  | no         | no    | yes      | yes      | no          | no     |
| Accountant       | yes  | yes    | yes  | yes        | no    | no       | no       | yes         | yes    |
| Cashier          | yes  | yes    | no   | no         | no    | no       | no       | no          | no     |

**Cashier (decided on #15):** a cashier may enter an NID when creating a party (the create code), but may not
view (`nid.view`) or change (`nid.edit`) an existing one.

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
19. **Cashier and the NID:** a cashier can create a party with an NID, but gets 403 on viewing it and on
    `PUT /v1/parties/:id/national-id`.

### 12. Order of work (each a separate PR, under ~400 lines)

ADR 0005 is merged (#3). The migration still waits for the RLS functions (`app_business_ids()`, part
1b-iii) and the organization tables (M2), because `party` references `business`.

1. ~~Shared read shapes and cursor pagination~~: **done in F1a (#7)**.
2. Frontend F1b: party list and profile against mock data (CR-01 parts that exist), in en and bn.
3. Shared: phone normaliser, create and edit payloads (no `businessId`) (both reviewers, merged first).
4. Migration: `party`, `party_identity`, `party_group`, `party_contact`, `party_address`, `party_merge_log`,
   `credit_hold`, with RLS, the composite keys and the append-only trigger (merge `main` and tell Munif first).
5. Party Query, Manager, Controller: create, read, list, edit, deactivate, with isolation cases (F2).
6. Duplicate-phone warning (F2, the only duplicate check needed before 29 Nov).
7. NID: cipher, `party_identity`, view and edit routes, audit (including denied views), log redaction, and
   the NID duplicate check.
8. After 29 Nov: merge and undo, with the size cap and `merged` added to `partyStatusSchema`, once the two
   open merge points in section 5 are settled.
9. **Release 1 (MotoMart decision, ADR 0001 row 15 and "MotoMart decisions", #23):** credit limit (S-15) and
   guarantor (`party_relation`, CR-12). The credit limit is optional: an empty `credit_limit` means no
   limit, which is the default. Built after F2 (steps 4 to 6), no longer left until after the Phase 1 gate.
10. After the Phase 1 gate: BIN rules (S-15) and `IPartyRequirement` wiring with Sales.

## Consequences

- One customer buying from two businesses is entered twice. That's the cost of keeping books and NIDs
  per business.
- Any user of a business can find every party of that business, whatever their branch. Branch limits come from
  the branch-scoped documents, not from Party.
- Every module that references a party carries `business_id` and uses the composite key. That is one more
  column on their tables, and it makes cross-business links impossible.
- Every ledger, dues and profile query must go through the one dal helper that follows `merged_into_id`.
- Large merges and imports are refused above their caps until the worker exists.
- A lost `PARTY_NID_KEY` makes every NID unreadable, so the keys are backed up apart from the database
  (section 3).
- Organization depends on a Party interface to create the walk-in party.
- Undoing this plan: everything sits in Party's own tables and routes. Moving to organization-level parties later
  means a data migration that groups per-business records, with the per-business ledgers left unchanged.

## Open questions

1. **Owner:** should one customer be shared across the owner's businesses? ADR 0005 already keys Party on
   `business_id`. This asks only whether the owner needs a shared view, which would be a report.
2. **Owner:** retention: when a customer asks to be forgotten, do we blank name, phone and NID and keep
   the ledger lines? Not in v1 unless the owner needs it.
3. **Both:** confirm the role table once ADR 0001 row C7 (the five roles) is decided.
4. **Owner:** is a free-text area enough, or does the dealership collect dues by fixed areas or routes? A fixed
   list would mean an `area` table (business-level).

Decided on #15 (Munif's review, 17 Nov), and written into the sections above: the composite key (section 2),
ledgers follow the merge (section 5), where the NID keys live (section 3), the cashier and the NID (section 8),
how the walk-in party is created (section 6), and merge built after 29 Nov (sections 5 and 12). The two open
merge points are in section 5.

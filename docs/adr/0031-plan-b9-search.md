# 0031: Plan for B9 and B10, search

| Field               | Value                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------- |
| Status              | Proposed                                                                                     |
| Date                | 2026-11-21                                                                                   |
| Deciders            | Farhan (owner), Munif                                                                        |
| Spec / roadmap refs | spec C-07, CR-01; ADR 0005, 0006, 0008, 0019 (#54, question 4); plan 2.3, B9, B10, section 9 |

## Context

The plan lists B9, "search", as an ADR first (plan 2.3; it reserved 0010, which went to provisioning), and B10
as the build: "list search with `pg_trgm`; `GET /v1/search` facade", tested by "Bangla name found; other business
never returned; NID never matched". Plan section 9 says per-module search is enough for release 1 and the
cross-module facade is cheap later. ADR 0019 (#54) question 4 recommends a plain contains search on `name`,
`code` and `phone_e164` for release 1, with no search index, and `pg_trgm` when a business grows.

This plan touches the NID rule, permissions and a migration (an extension and indexes), so CLAUDE.md requires it
before code. No code is in this PR.

## Decision

### 1. One set of rules for every module's `search`

Every list route accepts `search`, as `partyListQuerySchema` already does. The text goes through one shared
function, `shared/src/utils/search.ts`, so the form, the API and every module treat it the same:

- **Clean:** trim, collapse inner spaces, at most 100 characters. Fewer than 2 characters is refused
  (`400 VALIDATION_FAILED`, field code `search.too_short`), so a one-letter search can't read every row.
- **Escape:** `%`, `_` and `\` are escaped before they reach `ILIKE`, so a typed `%` matches a percent sign,
  not everything.
- **Phone-like text** (digits, spaces, `+`, `-` only) keeps its digits; a leading `0` gets `88` in front. The
  result is looked for inside the digits of `phone_e164` and `alt_phone_e164`: `01712`, `+8801712`, `8801712`
  and `017 12` all become `8801712` and find `+8801712345678`; `345678` finds it too.
- **Everything else** is a contains match, `ILIKE '%text%'`, on the module's own text columns. For Party:
  `name`, `name_bn` and `code` (ADR 0019 question 4). Bangla text matches as typed; there is no case to fold.

### 2. Never searchable

- **The NID**, in any form: not `nid_last4`, not `nid_hash`, not the ciphertext (ADR 0006 section 3).
- **Hidden fields** (cost, profit, salary; plan 2.5).
- An exact NID lookup is a separate route on `nid_hash`, with `party.nid.view` and an audit row (ADR 0006
  section 3); it comes with the NID work (ADR 0006 step 7), not here.

### 3. Indexes, only when needed (B10 part 2)

- Release 1 runs without a search index (ADR 0019 question 4).
- When a business's party search gets slow (open question 1), a migration adds `pg_trgm` and GIN indexes with
  `gin_trgm_ops` on `party (name)`, `party (name_bn)`, `party (code)` and on the phone digits.
- `pg_trgm` is a trusted extension (PostgreSQL 13 and later), so the migration owner can create it without a
  superuser; Neon supports it.
- **Bangla and trigrams:** `pg_trgm` builds trigrams only from characters the database locale counts as letters
  or digits. With a `C` locale, Bangla may give no trigrams, and the index would never be used. The migration
  PR first tests a Bangla name through the index (`EXPLAIN` shows the GIN index) on the CI database's locale
  (open question 2).

### 4. Searching across parts (B10 part 3, after release 1)

- `GET /v1/search?q=&parts=parties,sales,inventory` on a `SearchController` in api.
- It calls each requested module's Manager through `ISearchableManager.search(q, limit)` (api's contract,
  CLAUDE.md), never a Query.
- It runs as **one read-only tenant scope** (ADR 0005 `{ readOnly: true }`), so RLS limits rows to the caller's
  businesses and branches.
- A part the caller has no `<module>.*.view` permission for is skipped, not an error.
- At most 5 hits per part, each `{ part, type, id, label, number, href }` (`searchResultSchema`, shared).
- A statement timeout of 2 s for the whole search (ADR 0005 time limits).

## Tests to write first (run to see them fail)

Unit (shared):

1. The cleaner trims and collapses spaces, cuts at 100, and refuses 0 or 1 characters.
2. `%`, `_` and `\` are escaped; `50%` matches only a literal `50%`.
3. `01712`, `+8801712`, `8801712` and `017 12` all become `8801712`; `345678` stays `345678`; all of them
   match `+8801712345678`.

Real Postgres, through `GET /v1/parties?search=`:

4. `আব্দুর` finds `আব্দুর রহমান` by `name_bn`; `rahman` finds `Abdur Rahman` by `name`; `C-00` finds codes
   `C-000001` and `C-000002`.
5. The same name in business Y is never returned to a user of business X.
6. The NID is never searched: a party whose `nid_last4` is `4321`, with no `4321` in its phone, name or code,
   is not found by `4321`; and a unit test over `PartyQuery`'s search clause checks that its SQL names no `nid_`
   column at all, whichever path (phone-like or text) the search takes.
7. A search of `%` alone is refused as too short (`search.too_short`); a search of `5%` finds only a party with
   a literal `5%` in a searched column.
8. Tests check only their own fresh ids, never table-wide counts.

With the index (B10 part 2):

9. `EXPLAIN` on a contains search for a Latin and a Bangla name uses the GIN index on the CI database.

Facade (B10 part 3):

10. A user without `sales.*.view` gets party hits only; the `sales` part is skipped, not an error.
11. No more than 5 hits per part; no hit has a phone, NID or hidden field it shouldn't.

## Migration steps (written here, applied in B10 part 2, not now)

1. Merge `main`; tell Munif the search index migration is in flight (plan section 6, row 11: after `attachment`).
2. `npm run db:migrate:new -- party_search_index`: `CREATE EXTENSION IF NOT EXISTS pg_trgm;` and the GIN indexes
   in raw SQL; read every statement.
3. Check whether `db:migrate:check` reports the extension or the indexes as drift (open question 3).
4. `db:migrate:deploy` on a throwaway Postgres, `test:integration`.

## Size and PR split

| Part | Branch               | Contents                                              | Size (approx.) | Needs first                     |
| ---- | -------------------- | ----------------------------------------------------- | -------------- | ------------------------------- |
| 1    | `feat/search-rules`  | `shared/src/utils/search.ts`, tests 1–3 (both review) | ~150           | this ADR                        |
| 2    | `feat/search-index`  | `pg_trgm` and GIN indexes on `party`, test 9          | ~100           | part 1, A11 part 3, question 1  |
| 3    | `feat/search-facade` | `SearchController`, `ISearchableManager`, tests 10–11 | ~300           | part 1, two modules with search |

Tests 4 to 8 belong to A11's list route (ADR 0019 part 4), which uses part 1's rules.

## Blocked by

- A11 (`party`, ADR 0019, #54) for the first searched table.
- A6 and the `{ readOnly: true }` route kind (ADR 0005) for the facade.

## Consequences

- **Easier:** every module's search behaves the same, and a typed `%` or a phone in any form does what people
  expect.
- **Harder:** without an index, a contains search reads all of a business's parties; that's the accepted cost
  until part 2.
- **Keep true:** the NID and hidden fields are never searched; search never leaves the caller's scope.
- **Undo:** the rules are code; the indexes drop in a new migration.

## Open questions for Munif

1. **When to add the index:** when a business passes a few thousand parties, or when a search takes over 200 ms
   on real data? Recommended: whichever comes first, measured on the demo data (A19).
2. **The database locale:** what are `LC_COLLATE` and `LC_CTYPE` in Docker, CI and Neon? If they're `C`, Bangla
   trigrams may not index. Recommended: check in part 2 before relying on it; a contains search still works
   without the index.
3. **Prisma and `pg_trgm`:** declare the extension and `gin_trgm_ops` indexes in the schema (Prisma's
   PostgreSQL extensions support), or keep them in raw SQL if `db:migrate:check` accepts that? Recommended: try
   the schema first, raw SQL if drift appears.
4. **The facade after release 1:** agreed, as plan section 9 says? Recommended: yes.

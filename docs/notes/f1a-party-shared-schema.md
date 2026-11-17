# F1a: Party shared schema

**Task:** F1, part a. The shared shapes for customers and suppliers, so the backend and the frontend agree on
one definition. Read shapes only. No screens, routes or tables yet.

## What was built

- `partySchema`: one full party (customer, supplier or both). It must be at least one of the two.
- `partyListItemSchema`: one row of a list, with fewer fields. Extra fields are dropped, so an NID can't leak into a list.
- `partyListQuerySchema`: what a list request may ask for: search text, role, status, cursor, page size.
- `partyListResponseSchema`: one page of results, `{ items, nextCursor }`.
- `cursorPageSchema` and `pageQuerySchema` in `shared/src/utils/pagination.ts`, so every module pages the same way.
- Types (`Party`, `PartyListItem`, ...) are all `z.infer` of the schemas. Nothing is written twice.

## The request flow these schemas will serve (from F1b and F2)

1. The customer list screen calls `partyService.listCustomers({ search })`.
2. In F1b, a mock service returns sample rows. In F2, the real service calls `GET /v1/parties?role=customer&search=...`.
3. The API parses the query string with `partyListQuerySchema`. `"10"` becomes the number 10, blank search becomes "no search", and a bad value gives 400.
4. The Controller passes the parsed query to `PartyManager`, which asks `PartyQuery` for one page.
5. The Manager turns DTOs into `PartyListItem` objects. Anything not in the list schema is not sent.
6. The response `{ items, nextCursor }` matches `partyListResponseSchema`. The screen shows the rows and uses `nextCursor` for "load more".

## Why each file exists

| File                                      | Why                                                                         |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| `shared/src/schemas/party.schema.ts`      | The single source of truth for Party payloads (CLAUDE.md: Zod in `shared`). |
| `shared/src/schemas/party.schema.test.ts` | Tests written first: the rules of a valid party and a valid list request.   |
| `shared/src/types/party.types.ts`         | TypeScript types inferred from the schemas, never written by hand.          |
| `shared/src/utils/pagination.ts`          | Cursor pagination in one place (CLAUDE.md DRY rule: pagination from utils). |
| `shared/src/index.ts`                     | Exports pagination from the package's public surface.                       |

## Decisions in plain words

- **Phones are E.164** (`+8801700000001`). The schema only checks the form. Turning `01700000001` into E.164 is the form's job, added in F2.
- **No NID, no money** in these shapes. The NID gets its own restricted route (ADR 0001 row 2). Dues come in F3, from the ledger.
- **`status` is `active` or `inactive` only.** `merged` waits until ADR 0006 (merge) is agreed.
- **Two query types:** `PartyListQueryInput` (what a caller sends, where `limit` is optional) and `PartyListQuery` (after parsing, where `limit` is always set).

## Five questions an interviewer could ask

1. Why put the Zod schemas in a shared package instead of in the backend? _(One definition, so the backend validates what the frontend sends and the types can't drift apart.)_
2. How do you stop a sensitive field like a national ID from reaching a list screen? _(The list schema has no such field, and Zod drops unknown keys when it parses, which a test checks.)_
3. Why cursor pagination instead of page numbers? _(It stays correct when rows are added while you page, and stays fast on big tables.)_
4. Why `z.coerce.number()` for `limit`? _(Query strings are always text. Coercing in the schema keeps the controller simple.)_
5. Why is "at least a customer or a supplier" a `refine` and not two separate checks? _(It's a rule about two fields together, so it belongs on the object.)_

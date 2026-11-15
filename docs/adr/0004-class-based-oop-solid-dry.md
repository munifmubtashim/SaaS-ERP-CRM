# 0004: Class-based OOP, SOLID and DRY across the codebase

| Field    | Value                                                                        |
| -------- | ---------------------------------------------------------------------------- |
| Status   | Accepted (decided by Munif, 15 Nov 2026); Farhan confirms in review of PR #1 |
| Date     | 2026-11-15                                                                   |
| Deciders | Munif, Farhan                                                                |
| Refs     | ADR 0003 (layout), CLAUDE.md "Code standards"                                |

## Context

ADR 0003 split the backend into api → businessLogic → dal. We also need one shape for the code inside
each layer, so both developers and every Claude session write modules the same way and tests can
replace dependencies without a database.

## Decision

- One class per layer per module (`<Module>Controller`, `<Module>Manager`, `<Module>Query`); constructor
  injection typed as interfaces; construction only in composition roots (`createManagers`,
  `createControllers`, `createServices`).
- **The consuming layer owns the contract** (`I<Module>Query` in businessLogic, `I<Module>Manager` in api).
  The lower layer satisfies it structurally and never imports it: a `dal → businessLogic` import would create
  a package cycle, since `createManagers` imports dal. TypeScript checks conformance at the composition
  roots, where each class is passed where its interface is expected.
- Base classes only where two or more modules share code: `BaseQuery` (db client; tenant runner later),
  `BaseDTO` (common columns, explicit mapping), `BaseController` (validation and response helpers).
  **`BaseManager` is deferred** until two Managers share real code.
- DTOs are classes with static mapping methods; no Prisma type leaves dal.
- DRY: Zod schemas in shared are the only source of types; money, dates, pagination, errors and permissions
  come from shared utils. No abstraction until the same logic exists twice.
- Frontend: function components with hooks; services are classes behind interfaces, injected through
  `ServicesContext` so tests use fakes.

## Enforcement

Lint (`npm run lint`, CI):

| Rule                                                    | How                                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| No `new` of Query/Manager outside `createManagers`      | `no-restricted-syntax` NewExpression `/(Query\|Manager)$/`                            |
| No `new` of Controller outside `createControllers`      | `no-restricted-syntax` NewExpression `/Controller$/`                                  |
| No `new` of Service/HttpClient outside `createServices` | frontend `no-restricted-syntax`                                                       |
| Controllers depend on contracts, not businessLogic      | `@typescript-eslint/no-restricted-imports` on `*Controller.ts`                        |
| Managers take only types from dal                       | `@typescript-eslint/no-restricted-imports` with `allowTypeImports` on `*Manager.ts`   |
| No Prisma types re-exported from dal                    | `no-restricted-syntax` on export-from `generated` in `dal/index.ts`                   |
| Shared types inferred from Zod                          | `no-restricted-syntax` bans interfaces and object type literals in `shared/src/types` |
| No class components                                     | frontend `no-restricted-syntax` on `extends Component/PureComponent`                  |
| Liskov smell                                            | `no-restricted-syntax` on throwing "not supported/implemented"                        |
| Layer direction                                         | ADR 0003 `no-restricted-imports` rules (kept)                                         |

**Not enforceable by lint; enforced by review** (PR template and `/review-money-paths`):
single responsibility (a class described with "and"), open/closed (variation as a new class, not a
`switch` branch), interface segregation (small interfaces per use), Liskov beyond the "not supported"
pattern, "no abstraction until it exists twice", "similar code with different rules is not duplication",
DTOs being classes with mapping methods, money/date/pagination only from shared utils, one
responsibility per React component, and logic living in hooks.

## Consequences

More files per module (contracts, DTO class), offset by fakes that make Managers and Controllers testable
without a database (see `HealthManager.test.ts`, `api/test/helpers.ts`). Empty stub contracts carry an
eslint-disable comment until their first method arrives.

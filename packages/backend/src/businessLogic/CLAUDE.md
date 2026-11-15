# backend/src/businessLogic: rules only

Read the root CLAUDE.md first. No Express, no SQL, no Prisma. Imports `@erp/dal` (Queries, DTO types) and `@erp/shared`.

- `src/<Module>Manager.ts`: the business rules and invariants (money, stock, approvals, period lock).
- Managers call Queries and return shared types; they throw `AppError` for rule violations.
- `src/index.ts` `createManagers()` is the composition root: the only place Queries are built and handed to Managers.
- Unit-test Managers with fake Queries; prove money and stock rules again in integration tests against real Postgres.

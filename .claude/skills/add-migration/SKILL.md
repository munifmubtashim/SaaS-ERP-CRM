---
name: add-migration
description: Create a new Prisma migration safely (merge main first, edit only the owning module's schema file, review the SQL, add RLS for tenant tables). Use when the developer runs /add-migration <name>.
argument-hint: <migration_name_in_snake_case>
disable-model-invocation: true
---

# /add-migration $ARGUMENTS

Migrations are the conflict magnet and touch tenancy, so **a plan is mandatory** (CLAUDE.md lifecycle).
All paths below are under `packages/backend/src/dal/`.

## 0. Preconditions: stop if any fails

1. There is an agreed plan for this schema change (an ADR in `docs/adr/` or a plan the developer approved in this
   session): tables, columns, constraints, indexes, RLS policy, and expand/contract steps.
2. On the developer's own `dev-<name>` or `feat/*` branch, with a clean working tree (`git status`).
3. `main` has been merged in **just now**: `git fetch origin && git merge origin/main`. Ask the developer to run it
   if needed, and remind them to tell the other developer a migration is in flight.
4. Docker is up (`npm run docker:up`) and existing migrations are applied (`npm run db:migrate:deploy`).

## 1. Change the schema

- Edit **only** the owning module's `prisma/schema/<module>.prisma`. Never `main.prisma` unless the change is to
  the generator/datasource (shared, both review).
- Conventions: `@@map("singular_snake_case")`, UUID v7 ids, money `Decimal @db.Decimal(18, 2)`,
  quantities `Decimal @db.Decimal(18, 3)`, `business_id` (+ `branch_id`) on business-owned tables, timestamps UTC.
- Prefer **expand** changes (new nullable column, new table). Never rename a column in one step (roadmap 9.3).

## 2. Generate, then read the SQL

```bash
npm run db:migrate:new -- $ARGUMENTS
```

Open the new `prisma/migrations/<timestamp>_$ARGUMENTS/migration.sql` and read every statement.
For each **new tenant table**, write the policy in `sql/rls/<table>.sql` and append it to the same migration:

```sql
ALTER TABLE "<table>" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "<table>" FORCE ROW LEVEL SECURITY;
CREATE POLICY <table>_tenant ON "<table>"
  USING (business_id = ANY (string_to_array(current_setting('app.business_ids', true), ',')::uuid[]))
  WITH CHECK (business_id = ANY (string_to_array(current_setting('app.business_ids', true), ',')::uuid[]));
```

Ledger and stock tables also get their immutability triggers (no UPDATE/DELETE of posted rows), from `sql/triggers/`.

## 3. Update the dal layer

- The module's `dto/<Module>DTO.ts` gets the row shape; its `query/<Module>Query.ts` gets the queries.
- Nothing above dal touches Prisma: Managers call the Query.

## 4. Verify

```bash
npm run db:migrate:deploy && npm run db:migrate:check && npm run test:integration
```

Add integration tests: RLS hides other businesses' rows, and the app role cannot bypass it.

## 5. Never

- Never edit a migration that is already on `main` (the edit hook blocks it). Make a new one.
- If another migration landed on `main` first and they collide: delete **yours**, merge main, regenerate.
- The PR must list the migration under "Migration notes".

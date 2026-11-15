# backend/src/dal: database access only

Read the root CLAUDE.md first. Use `/add-migration` for schema changes. Imports `@erp/shared` only.

- `query/<Module>Query.ts` is the only code that runs SQL or Prisma calls; it returns `dto/<Module>DTO.ts` shapes.
- `prisma/schema/main.prisma` holds only the generator and datasource; each module owns `<module>.prisma` (CODEOWNERS).
- Migrations run as the owner (`MIGRATION_DATABASE_URL`); the app uses `erp_app` (`DATABASE_URL`), NOSUPERUSER NOBYPASSRLS.
- RLS policies, immutability and balanced-journal triggers and group views: write them in `sql/`, ship them inside a migration.
- Never edit a migration that has reached `main`. `npm run db:migrate:check` must report no difference.

# backend/src/api: HTTP layer only

Read the root CLAUDE.md first. This layer imports `@erp/business-logic` and `@erp/shared`, never `@erp/dal`, Prisma or `pg`.

- `routes/<Module>Routes.ts` returns `{ module, basePath, scope, router }`; register it in `routes/index.ts`.
- `controllers/<Module>Controller.ts`: parse input with `parseInput(schema, req.body)`, call the Manager, send the result. No rules here.
- Middleware order lives in `app.ts`; `errorMiddleware` is always last and is the only place errors become responses.
- `scope: 'tenant'` routes need a case in `test/isolation/cases.ts`; public routes need a place on `PUBLIC_ROUTES`.
- Tests: `test/unit` (Supertest with fake Managers via `test/helpers.ts`), `test/integration` (real Postgres), `test/isolation`.

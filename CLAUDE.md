# CLAUDE.md: shared rules for every Claude Code session

Multi-business ERP and CRM. Two developers: **Munif** (`dev-munif`) and **Farhan** (`dev-farhan`).
First customer is a motorcycle dealership, but the **core is generic**; motorcycle things live in the vehicle pack.

These rules apply to both developers and to every session. Changing this file needs a PR reviewed by the
other developer, like any code. Personal preferences go in `CLAUDE.local.md` (gitignored), never here.
When Claude repeats a mistake, fix the rule here, not just the code.

**Source of truth:** `docs/reference/`, the Roadmap (Draft v2) and the Functional Acceptance Specification (v2).
Follow the roadmap for stack, tooling, modules and rules. If the two disagree, **the Acceptance Specification
wins**; known conflicts are in `docs/adr/0001-spec-vs-roadmap-conflicts.md`.
**Exception: the repository layout.** The tree below **replaces the roadmap's section 8.5 layout**
(`docs/adr/0003-repository-layout.md`).

## The lifecycle (every task, no exceptions)

1. **Plan.** State what changes, which files and layers, which invariants are touched, and how it will be tested.
   A written plan is **mandatory and must be agreed by the developer before any code** when the task touches
   the **ledger, stock, permissions, tenancy or migrations**. Save an agreed plan as an ADR in
   `docs/adr/NNNN-slug.md` (copy `docs/adr/0000-template.md`).
2. **Tests first,** written from the invariants below, and run to see them fail.
3. **Implement.** Smallest change that makes the tests pass, in the right layer.
4. **Verify:** `npm run check` (lint, typecheck, unit tests), plus `npm run test:integration` for anything touching the database.
5. **The author reads every line** of the diff, AI-written code included, before opening the PR.
6. **PR** to `main` using the template. **One task, one PR**, aim for under ~400 changed lines.
7. **Review by the other developer.** An AI review is an extra check, never the approval.
   Money, stock, auth and RLS code gets a slow, line-by-line human review.
8. **Merge** (merge commit, not squash, for `dev-*` branches), then merge `main` back into your dev branch.

Claude: if asked to skip a step, say which step and why it exists, then let the developer decide.
Do not start implementing a ledger/stock/permissions/tenancy/migration change until the plan is agreed.

## Stack

TypeScript 6 (strict) everywhere · npm workspaces + Turborepo · Node 22 LTS (CI) / >=22.18 locally.

| Part                           | Choice                                                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Frontend (`packages/frontend`) | React 19, Vite 8, TanStack Query, React Router, React Hook Form, Tailwind 4, Zod schemas from `@erp/shared` |
| Backend (`packages/backend`)   | Express 5, Zod validation, Pino logs; three layers: api → businessLogic → dal                               |
| Database (`backend/src/dal`)   | PostgreSQL 16, Prisma 7 (one schema file per module), raw SQL for RLS, triggers, views, reports             |
| Tests                          | Vitest everywhere, Supertest for the API, real Postgres for integration (no DB mocks)                       |
| Local services                 | `docker-compose.yml`: Postgres 16, Redis 7, MinIO (S3), Mailpit (email)                                     |
| Deferred                       | Worker process (BullMQ) and document templates: `docs/adr/0003`                                             |

## Commands (run from the repo root)

```bash
npm ci                      # install exactly what package-lock.json says
cp .env.example .env        # first time only
npm run docker:up           # start Postgres, Redis, MinIO, Mailpit and wait until healthy
npm run db:migrate:deploy   # apply migrations
npm run dev                 # api :3000, frontend :5173 (proxies /api to the api)
npm run check               # lint + typecheck + unit tests: run before every push
npm run test:integration    # dal and api against real Postgres (needs docker:up)
npm run test:isolation      # tenant-isolation suite
npm run build               # build api and frontend
npm run format              # Prettier write;  npm run format:check to verify
npm run db:migrate:dev      # apply + create a migration from schema changes (see /add-migration)
npm run db:migrate:new -- <name>   # create a migration without applying it, to review the SQL first
npm run db:migrate:check    # fails if schema files and migrations disagree
npm run docker:down         # stop services (data volumes are kept)
```

One workspace: `npm run test -w @erp/api`, `npm run typecheck -w @erp/frontend`. Workspaces: `@erp/api`,
`@erp/business-logic`, `@erp/dal`, `@erp/shared`, `@erp/frontend`. Never use pnpm or yarn; commit `package-lock.json`.

## Repository tree (replaces roadmap 8.5)

```
package.json  package-lock.json  tsconfig.json (base)  turbo.json  docker-compose.yml  .env.example
CLAUDE.md  .claude/  .github/  docs/{adr,reference}/  tools/  design/
packages/
  backend/
    src/
      api/                 HTTP layer only (Express)
        index.ts app.ts server.ts
        config/            env.ts, logger.ts
        middleware/        authMiddleware, roleMiddleware, tenantMiddleware, errorMiddleware, validate, requestId
        routes/            <Module>Routes.ts, index.ts (buildRoutes), types.ts (ModuleRoutes, PUBLIC_ROUTES)
        controllers/       <Module>Controller.ts, index.ts (createControllers)
        types/express.d.ts
        test/              unit/, integration/, isolation/
      businessLogic/       rules; no Express, no SQL
        src/               <Module>Manager.ts, index.ts (Managers + createManagers composition root)
      dal/                 database access only
        index.ts  config/db.ts (Prisma client)
        prisma/            schema/<module>.prisma (+ main.prisma), migrations/, seeds/
        sql/               raw SQL source: RLS, triggers, views
        dto/               BaseDTO.ts, <Module>DTO.ts
        query/             <Module>Query.ts
  frontend/
    src/
      main.tsx
      app/                 App.tsx, router.tsx, providers.tsx, RouteError.tsx, AppShell/
      components/ui/       design system components (Button, Card, StatusPill ...)
      features/<module>/   one folder per module
      services/            <module>Service.ts (API calls), http.ts
      i18n/                en.ts, bn.ts (same keys, enforced by a test)
      store/  styles/ (tokens.css, index.css)  test/
  shared/
    src/                   index.ts, types/<module>.types.ts, schemas/<module>.schema.ts, utils/ (money, date, permissions, AppError)
```

The **Health** slice is the pattern to copy: `HealthRoutes → HealthController → HealthManager → HealthQuery`
(`SELECT 1`), `health.types.ts` + `health.schema.ts` in shared, `healthService.ts` + `features/health` in the frontend.

## Layer rules (enforced by ESLint `no-restricted-imports`; a violation fails `npm run lint`)

- **One direction only: api → businessLogic → dal.** Controllers call Managers; Managers call Queries.
  Nothing skips a layer (api never imports `@erp/dal`, Prisma or `pg`) and nothing calls upward.
- **api** is HTTP only: routes, middleware, parse input with `parseInput(schema, req.body)`, call a Manager, send the result.
- **businessLogic** holds the rules: no Express, no SQL, no Prisma. `createManagers()` in its `index.ts` is the
  composition root that builds the dal client and Queries, so api depends on businessLogic only.
- **dal** is the only place that talks to the database. Queries return DTOs; Managers turn DTOs into shared types.
- **shared** imports nothing from the other packages. **frontend** imports `@erp/shared` only and reaches the
  backend over HTTP through `src/services`.

## Naming pattern

| What       | File                                                                                             | Export                                                      |
| ---------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Routes     | `api/routes/<Module>Routes.ts`                                                                   | `<module>Routes(controller): ModuleRoutes`                  |
| Controller | `api/controllers/<Module>Controller.ts`                                                          | `class <Module>Controller`                                  |
| Manager    | `businessLogic/src/<Module>Manager.ts`                                                           | `class <Module>Manager`                                     |
| Query      | `dal/query/<Module>Query.ts`                                                                     | `class <Module>Query extends BaseQuery`                     |
| Contracts  | `businessLogic/src/contracts/I<Module>Query.ts`, `api/controllers/contracts/I<Module>Manager.ts` | `interface I<Module>Query`, `interface I<Module>Manager`    |
| DTO        | `dal/dto/<Module>DTO.ts`                                                                         | `class <Module>DTO extends BaseDTO` with `static fromRow()` |
| Types      | `shared/src/types/<module>.types.ts`                                                             | `type <Module>`                                             |
| Schema     | `shared/src/schemas/<module>.schema.ts`                                                          | `const <module>Schema` (Zod)                                |
| Prisma     | `dal/prisma/schema/<module>.prisma`                                                              | models for that module only                                 |
| Frontend   | `frontend/src/features/<module>/`, `frontend/src/services/<module>Service.ts`                    | `class <Module>Service implements I<Module>Service`         |

Modules and owners (`.github/CODEOWNERS`): **Munif**: Auth, Organization, Product, Inventory, Accounting, Vehicle,
Report. **Farhan**: Party, Sales, Purchase, Service, Crm. Each has a stub in every layer with a `TODO(owner)`.
Shared code (`shared`, `dal/prisma` entry file and migrations, `app.ts`, every `index.ts`, the app shell, CI and
these rules) needs both reviewers and changes in **small separate PRs, merged first**.

Every module router is mounted from `api/routes/index.ts` with `scope: 'public' | 'tenant'`. A tenant route
without a case in `api/test/isolation/cases.ts` fails CI; a public route must be on `PUBLIC_ROUTES`.

## Code standards: classes, SOLID, DRY (ADR 0004; example: the Health slice)

- One class per layer per module: `<Module>Controller`, `<Module>Manager`, `<Module>Query`; Routes files only build a router and bind controller methods.
- Dependencies arrive through the constructor, typed as interfaces; never `new` a dependency inside a class.
- Construct Queries and Managers only in `createManagers`, Controllers only in `createControllers`, frontend services only in `createServices` (lint-enforced).
- The consuming layer owns the contract: `businessLogic/src/contracts/I<Module>Query.ts`, `api/controllers/contracts/I<Module>Manager.ts`; the lower layer satisfies it without importing it.
- Base classes only for code two or more modules share: `BaseController`, `BaseQuery`, `BaseDTO` today; no `BaseManager` until two Managers share code.
- DTOs are classes with static mapping methods (`fromRow`); no Prisma type leaves dal.
- Single responsibility: Controller = HTTP, Manager = rules, Query = database; a class described with "and" gets split.
- Open/closed: add variation (payment methods, posting rules, packs) as a new class behind an interface, not a new `switch` branch.
- Liskov: a subclass works wherever its base does; never override a method to throw "not supported".
- Interface segregation: small interfaces per use; no catch-all `I<Module>Service`-style contract on the backend.
- DRY: types are `z.infer` of the shared Zod schemas; money, dates, pagination, errors and permissions come from `shared/src/utils` only.
- No abstraction until the same logic exists twice; similar code with different business rules stays separate.
- Frontend: function components with hooks only; logic in custom hooks; API access in `<Module>Service` classes behind interfaces, reached via `useServices()`; shared UI in `components/ui`.

## Coding conventions (roadmap appendix C)

- **Database:** snake_case, **singular** table names (`@@map("invoice")`), UUID v7 keys, timestamps in UTC,
  money `numeric(18,2)`, quantities `numeric(18,3)`. Every business-owned table has `business_id`
  (and `branch_id` where branch-scoped), `created_at`, `updated_at`, `created_by`, `version` where edited concurrently.
- **API:** nouns and plural paths under `/v1` (`/v1/invoices`); verbs only for actions (`/v1/invoices/:id/post`).
  Cursor pagination. Dates ISO 8601, stored UTC, displayed in Asia/Dhaka.
- **Errors:** always `{code, message, fields[], requestId}`. Throw `AppError` (from `@erp/shared`) in any layer;
  only `errorMiddleware` turns errors into responses. Stable machine `code`s; human messages are localised.
- **TypeScript:** strict; no `any` without an `eslint-disable` comment that says why. Zod schemas in `shared`
  are the single source of truth for API payloads, used by both backend and frontend.
- **Money and dates:** only through `shared/src/utils`. No raw number arithmetic on money anywhere else.
- **Logs:** Pino only, no `console.log`. Never log passwords, tokens, cookies, full phone numbers or NIDs.
- **UI:** all strings in `frontend/src/i18n` (en and bn). Only token colours (Tailwind classes such as
  `bg-accent`, `text-muted` map to `styles/tokens.css`). Read `.claude/skills/erp-ui-design` before building a screen;
  the approved look is `design/owner-dashboard/`.
- **Commits:** Conventional Commits with a module scope: `feat(sales): ...`, `fix(inventory): ...`,
  types `feat fix refactor test docs chore perf build ci`.

## Money and stock invariants (roadmap 4.3): test these first

1. **Ledger is the truth.** Every money movement is a balanced journal: `sum(debit) = sum(credit)`, enforced by
   a deferred constraint trigger, posted once in one transaction.
2. **Posted is permanent.** Posted journals and stock movements are never updated or deleted (trigger-enforced).
   A correction is a **reversal** that points at the original. Financial documents are voided, never deleted.
3. **Stock is a ledger.** On hand = sum of `stock_movement.qty_delta`. Snapshots (`stock_balance`) are
   rebuildable caches. Negative stock is blocked (spec F-08).
4. **Source documents post.** An invoice posts its journal and stock movements in **one** transaction and stores the journal id.
5. **Idempotency.** Every POST with money or stock effects accepts `Idempotency-Key`; a repeat returns the first result.
6. **Concurrency.** Reservations and decrements use `SELECT ... FOR UPDATE` or an atomic conditional `UPDATE`,
   never read-then-write in application code. Two cashiers, one chassis: one wins (spec F-02).
7. **Costing.** Weighted average per branch; serial-tracked units (bikes) carry their own cost.
8. **Pass-through money is a liability.** BRTA fees and booking advances are liabilities, never revenue (spec A-10, B-02).
9. **Period lock.** No back-dated change into a closed or locked period (spec A-12).
10. **Outbox.** Domain events are written to the outbox in the same transaction (relay deferred with the worker).

## Tenancy rules (roadmap 4.2)

- Organization → Legal entity → Business → Branch; a business belongs to one legal entity. Books are per business (ADR 0001).
- National ID: stored on Party only, encrypted at rest, role-restricted, every view logged, never logged in plain text.
- Every business-owned row has `business_id`; PostgreSQL **RLS is enabled and FORCED** on every tenant table.
- **Every request runs in one transaction** that starts with `SET LOCAL app.organization_id = ...` and
  `SET LOCAL app.business_ids = ...`. **Never plain `SET`**: it leaks to the next request on a pooled
  connection. A query outside such a transaction must fail. In this tree: `tenantMiddleware` resolves
  `req.tenant`; the Controller passes it to the Manager; the Manager runs its Queries through a dal helper
  that opens the transaction (to be designed in a Phase 1 ADR before the first tenant table).
- The app connects as `erp_app`: **not superuser, not BYPASSRLS, owns no table or view**. Migrations run as the owner.
- Group views are `WITH (security_invoker = true)` and always filter on `organization_id` and the caller's
  allowed businesses. Cross-business totals come from `report_snapshot`. No all-seeing role is reachable from a request.
- Mandatory tests on every PR: user of business X cannot read, write or guess ids of business Y on any route;
  group owner of org A sees nothing of org B; pooled connection returns nothing until settings are set again.

## Git rules (roadmap 8)

- `main` is protected: PR only, green CI, one approval from **the other** developer, branch up to date. No self-merge.
- Work on your own `dev-<name>` branch, or a short `feat/*` branch off it. Push your dev branch at least daily.
- **Merge `main` into your dev branch; never rebase a pushed dev branch.** Open a PR every 2-3 days.
- Merge dev-branch PRs with a **merge commit**, not squash. Squash only short `feat/*` branches.
- Before creating a migration, merge `main` and tell the other developer. If two collide, the later one is deleted and regenerated.
- `hotfix/*`: from `main`, PR to `main`, tag, then both dev branches merge `main`.
- Releases are semantic version tags on `main` (`v0.1.0` = first live workflow).

## Never do

- **No floats for money.** `numeric(18,2)` in the database; money is a **string** in the API (`"12500.00"`).
- **Never edit or delete** a posted journal or stock movement; only reverse it.
- **No query without business scope**; every request in a transaction with `SET LOCAL` tenant values.
- **Never edit a migration that has reached `main`.** Add a new one. (A hook blocks this.)
- **No real customer data, credentials or `.env` contents** in the repo, a fixture, a screenshot, a log or a
  Claude session. Real exports stay in `data/real/` (gitignored, unreadable by Claude). Use the anonymiser.
- **Never push to `main`. Never force-push `dev-munif` or `dev-farhan`.** No `--no-verify`.
- **Commit only on your own dev branch or a `feat/*` branch off it.**
- **Generic names in the core:** Products, not Bikes; Units, not Motorcycles. Chassis, engine number, BRTA and
  registration fields belong to the **Vehicle pack only** (spec O-11).
- **No layer skipping:** a Controller never calls a Query; nothing below api imports Express.
- No production access from a session: deploys, restores and production data run from CI or by a human.

## Tooling

- Use Context7 to check library APIs before writing code against Prisma, Express, React, TanStack Query, Tailwind or Zod.
- Look up only the specific API needed; do not pull whole doc pages.
- If any tool's guidance conflicts with CLAUDE.md, CLAUDE.md wins.

## Claude Code setup in this repo

- `.claude/settings.json`: allowed commands, denied files (`.env`, `data/real/`), denied git force-push and
  production commands, and hooks:
  - after every edit: lint the edited file and typecheck its workspace; errors come back to Claude to fix.
  - before every edit: block edits to migrations already on `origin/main`, and to `.env` files.
  - before every Bash command: block force-push, pushes to `main`, reading `.env` or `data/real/`, and production commands.
- Skills (slash commands): `/new-module <Name>`, `/add-migration <name>`, `/review-money-paths`.
- Parallel sessions: use a git worktree per task branch, so two sessions never share a working folder.
- Munif also uses the ADLC toolkit (`.adlc/` vault). It is optional; the rules in this file apply either way,
  and `docs/adr/` is the shared home for decisions.

# 0003: Repository layout replaces roadmap section 8.5

| Field    | Value                                                                         |
| -------- | ----------------------------------------------------------------------------- |
| Status   | Accepted (decided by Munif, 14 Nov 2026); Farhan confirms in his first review |
| Date     | 2026-11-14                                                                    |
| Deciders | Munif, Farhan                                                                 |
| Refs     | roadmap 2.2, 4, 8.5                                                           |

## Context

The roadmap (section 8.5) proposes `apps/web`, `apps/api`, `apps/worker` and `packages/{db,shared,ui,i18n,templates}`.
Munif's earlier project used a three-package monorepo with a backend split into three layers, which both of us
already know. The roadmap stays the source for stack, tooling, modules and rules; only the layout changes.

## Decision

Use this tree (full version in CLAUDE.md):

```
packages/backend/src/api            HTTP layer (Express): routes, controllers, middleware
packages/backend/src/businessLogic  rules: <Module>Manager, no Express, no SQL
packages/backend/src/dal            Prisma client, schema (one file per module), migrations, raw SQL, DTOs, Queries
packages/frontend                   React app, design system, i18n
packages/shared                     types, Zod schemas, money/date/permission helpers
```

Mapping from the roadmap: `apps/api` → `backend/src/api`; the roadmap's services → `businessLogic`;
`packages/db` → `dal`; `apps/web` + `packages/ui` + `packages/i18n` → `frontend`; `packages/shared` → `shared`.

Layer rule: one direction only, api → businessLogic → dal; shared imports nothing; the frontend imports only
shared. Enforced by ESLint `no-restricted-imports` (a violation fails CI) and by each layer's dependencies.
`createManagers()` in businessLogic is the composition root, so api never imports dal.

**Deferred** (not created in Phase 0):

- **Worker process** (BullMQ: PDFs, SMS, imports, scheduler, outbox relay). Redis stays in docker compose.
  Create it when the first background job is needed (expected Phase 1 importer or Phase 2 PDFs), as
  `packages/backend/src/worker`, calling Managers like the api does. Until then the outbox relay does not exist.
- **Document templates** (roadmap `packages/templates`: invoice, Mushak 6.3, challan). Decide their home when
  the first printable document is built (Phase 2).

## Consequences

- Tenancy needs care: `SET LOCAL` must run inside the transaction that wraps a request's queries, but the api
  layer may not touch dal. `tenantMiddleware` resolves the scope; the Manager runs Queries through a dal
  helper that opens the transaction. A Phase 1 ADR designs this before the first tenant table.
- The roadmap's section 8.5 and its references to `apps/*` are superseded by this ADR and CLAUDE.md.
- Each module has a stub in every layer, so ownership is visible in CODEOWNERS from day one.

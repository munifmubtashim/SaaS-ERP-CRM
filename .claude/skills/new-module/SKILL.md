---
name: new-module
description: Scaffold a new business module in every layer (Routes, Controller, Manager, Query, DTO, types, schema, Prisma file, frontend feature and service) following this repo's naming pattern. Use when the developer runs /new-module <Name>.
argument-hint: <ModuleName in PascalCase>
disable-model-invocation: true
---

# /new-module $ARGUMENTS

Create the skeleton of module **$ARGUMENTS** in every layer. Follow CLAUDE.md. Scaffolding only: no business logic.
The 12 roadmap modules already have stubs; use this for a new one.

## 0. Check before writing anything

1. The name is PascalCase and **generic** (`Product`, not `Bike`). Vehicle-only concepts belong in the `Vehicle`
   pack, never in a core module (spec O-11). If the name breaks this, stop and say so.
2. Ask the developer who owns it (Munif or Farhan).
3. Confirm the branch is the developer's own `dev-<name>` or a `feat/*` branch off it (`git branch --show-current`).
4. Show the file list below and wait for OK.

## 1. Files (copy the Health slice and the existing stubs, e.g. Sales)

Let `<M>` = $ARGUMENTS and `<m>` = its camelCase form.

```
packages/shared/src/schemas/<m>.schema.ts            export const <m>Schema = z.object({})
packages/shared/src/types/<m>.types.ts               export type <M> = z.infer<typeof <m>Schema>
packages/backend/src/dal/dto/<M>DTO.ts               export type <M>DTO = BaseDTO
packages/backend/src/dal/query/<M>Query.ts           export class <M>Query { constructor(readonly db: DbClient) }
packages/backend/src/dal/prisma/schema/<m>.prisma    header comment with module + owner (no models yet)
packages/backend/src/businessLogic/src/<M>Manager.ts export class <M>Manager { constructor(readonly query: <M>Query) }
packages/backend/src/api/controllers/<M>Controller.ts export class <M>Controller { constructor(readonly manager: <M>Manager) }
packages/backend/src/api/routes/<M>Routes.ts         <m>Routes(controller): ModuleRoutes, basePath '/v1/<plural>', scope 'tenant'
packages/frontend/src/features/<m>/index.ts
packages/frontend/src/services/<m>Service.ts
```

Every stub carries `TODO(<owner>): <what the module owns>` and the line "Stub only: no logic until a plan is agreed".

## 2. Wire it in (these files need both reviewers)

- `shared/src/index.ts`: export the schema and types.
- `dal/index.ts`: export `<M>Query` and `<M>DTO`.
- `businessLogic/src/index.ts`: add `<m>: <M>Manager` to `Managers` and build it in `createManagers()`.
- `api/controllers/index.ts` and `api/routes/index.ts`: add the Controller and the Routes.
- `.github/CODEOWNERS`: add every new path under the owner, in the same PR.
- UI strings go to `frontend/src/i18n/en.ts` **and** `bn.ts`.

## 3. Finish

- Run `npm run check`. Fix everything (the layer lint rule must pass).
- No migration here. If the module needs tables: plan first, then `/add-migration`.
- Summarise the files created and remind the developer: plan, then tests from the invariants, before real code.

---
name: new-module
description: Scaffold a new business module in every layer with the class and interface skeleton (Controller, Manager, Query, DTO, contracts, types, schema, Prisma file, frontend service and feature) following CLAUDE.md "Code standards". Use when the developer runs /new-module <Name>.
argument-hint: <ModuleName in PascalCase>
disable-model-invocation: true
---

# /new-module $ARGUMENTS

Create the skeleton of module **$ARGUMENTS** in every layer. Scaffolding only: no business logic.
Follow CLAUDE.md "Code standards". Copy an existing stub (for example `Sales`) file by file; the
**Health** slice shows the same skeleton with real code in it.

## 0. Check first

1. The name is PascalCase and **generic** (`Product`, not `Bike`); vehicle-only concepts belong in `Vehicle` (spec O-11).
2. Ask who owns it (Munif or Farhan). Confirm the branch is the owner's `dev-<name>` or a `feat/*` off it.
3. Show the file list below and wait for OK.

## 1. Files (`<M>` = $ARGUMENTS, `<m>` = camelCase)

| Layer         | File                                       | Skeleton                                                                                                                      |
| ------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| shared        | `shared/src/schemas/<m>.schema.ts`         | `export const <m>Schema = z.object({})`                                                                                       |
| shared        | `shared/src/types/<m>.types.ts`            | `export type <M> = z.infer<typeof <m>Schema>` (never hand-written)                                                            |
| dal           | `dal/dto/<M>DTO.ts`                        | `class <M>DTO extends BaseDTO`, private constructor, `static fromRow(row)`                                                    |
| dal           | `dal/query/<M>Query.ts`                    | `class <M>Query extends BaseQuery {}`                                                                                         |
| dal           | `dal/prisma/schema/<m>.prisma`             | header comment with module and owner, no models                                                                               |
| businessLogic | `businessLogic/src/contracts/I<M>Query.ts` | empty `interface I<M>Query` + eslint-disable TODO comment                                                                     |
| businessLogic | `businessLogic/src/<M>Manager.ts`          | `constructor(protected readonly query: I<M>Query)`                                                                            |
| api           | `api/controllers/contracts/I<M>Manager.ts` | empty `interface I<M>Manager` + eslint-disable TODO comment                                                                   |
| api           | `api/controllers/<M>Controller.ts`         | `extends BaseController`, `constructor(protected readonly manager: I<M>Manager)`                                              |
| api           | `api/routes/<M>Routes.ts`                  | builds a Router, binds controller methods, returns `{ module, basePath: '/v1/<plural>', scope: 'tenant', router }`            |
| frontend      | `frontend/src/services/<m>Service.ts`      | empty `interface I<M>Service`; `class <M>Service implements I<M>Service`, `constructor(protected readonly http: IHttpClient)` |
| frontend      | `frontend/src/features/<m>/index.ts`       | feature folder (components, hooks)                                                                                            |

Every file carries `TODO(<owner>): <what the module owns>` and "Stub only: no logic until a plan is agreed".

## 2. Wire it in (index files need both reviewers)

- `shared/src/index.ts`: export schema and types. `dal/index.ts`: export `<M>DTO`, `<M>Query`.
- `businessLogic/src/index.ts`: export the contract type and Manager; add to `Managers`; construct in `createManagers()`.
- `api/controllers/contracts/index.ts`: add to `ApiManagers`. `api/controllers/index.ts`: construct in `createControllers()`.
  `api/routes/index.ts`: add the Routes.
- `frontend/src/services/index.ts`: add to `Services` and `createServices()`. Add `{}` to the fakes in
  `api/test/helpers.ts` and `frontend/src/test/fakeServices.ts`.
- `.github/CODEOWNERS`: every new path under the owner. UI strings in `i18n/en.ts` **and** `bn.ts`.

## 3. Finish

- `npm run check` must pass, including the lint rules for layers and composition roots.
- No migration here: plan first, then `/add-migration`.
- Remind the developer: when the first method arrives, add it to the contract interface first, write the
  test with a fake (see `HealthManager.test.ts`), then implement.

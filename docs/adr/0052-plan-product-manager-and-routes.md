# 0052: Plan for the product Manager, schemas and routes

| Field               | Value                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------- |
| Status              | Proposed                                                                               |
| Date                | 2026-11-23                                                                             |
| Deciders            | Munif, Farhan                                                                          |
| Spec / roadmap refs | spec P-05, P-07, P-10, C2, O-11; ADR 0020 (#58) sections 3 and 4, part 4; ADR 0005; A6 |

## Context

ADR 0020 (#58, approved) plans the `product` table (#105) and `ProductQuery` (#124), and says "No routes in
this ADR's first part"; its part 4 adds the list routes once A6 exists. No approved plan covers creating or
editing a product over HTTP, the `ProductManager`, or the shared create and edit schemas. The product list
schemas are in #34, which isn't reviewed yet.

This touches permissions (who may create or edit a product) and tenancy (new tenant routes), so CLAUDE.md
requires an agreed plan before code. This ADR is that plan. It changes no table and adds no migration.

## Decision

### 1. Routes (all `scope: 'tenant'`, under `/v1/products`)

| Method and path          | Does                                                | Answers                                                               |
| ------------------------ | --------------------------------------------------- | --------------------------------------------------------------------- |
| `GET /v1/products`       | the list: `search`, `status`, cursor, `limit` (#34) | `200` `productListResponseSchema`                                     |
| `GET /v1/products/:id`   | one product                                         | `200` `productDetailSchema`; `404 product.not_found`                  |
| `POST /v1/products`      | create, in the request's one business               | `201` detail, `Location`; `409 product.code_taken`; `400` fields      |
| `PATCH /v1/products/:id` | edit; the body carries the `version` it read        | `200` detail; `409 product.version_conflict`; `404 product.not_found` |

- **No delete.** A product is archived (`status: 'archived'`), never deleted (#105 grants no `DELETE`).
- **Not idempotent routes.** Creating or editing a product moves no money or stock (ADR 0011 section 6). A
  repeated create is refused by the unique code; a repeated edit is refused by the version.
- **One business.** `POST` and `PATCH` need a scope with exactly one business (`ProductQuery` refuses
  several). `GET` may be a read-only group route once ADR 0007 says how the business is chosen.

### 2. Shared schemas (`shared/src/schemas/product.schema.ts`, extending #34)

- `productDetailSchema`: the list item, plus `nameBn`, `category`, `sellPrice` (`moneySchema`, a string) and
  `version`. **No cost field**: ADR 0020 test 10 covers every product response schema.
- `productCreateSchema`: `code` (1 to 32, trimmed), `name`, `nameBn?`, `brand?`, `category?`, `unit`,
  `tracking`, `sellPrice` (`moneySchema`, not negative).
- `productEditSchema`: `version` (positive int) plus at least one of the editable fields. `code` and `tracking`
  are not accepted: `.strict()` makes them a `400`, not a silent drop.
- Types are `z.infer` of these (ADR 0004).

### 3. Layers

| Layer         | File                                                          | Change                                                                                               |
| ------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| businessLogic | `contracts/IProductQuery.ts`                                  | `find`, `list`, `create`, `edit`: what `ProductQuery` (#124) already has                             |
| businessLogic | `ProductManager.ts`                                           | maps DTOs to shared types; `edit` null → `find`: missing is `404`, present is `409 version_conflict` |
| api           | `controllers/contracts/IProductManager.ts`                    | `list`, `get`, `create`, `edit`, each taking the tenant and the caller                               |
| api           | `controllers/ProductController.ts`, `routes/ProductRoutes.ts` | parse with the shared schemas, call the Manager, return `{status, body, headers}`                    |
| api           | `test/isolation/cases.ts`                                     | one case per route (CLAUDE.md: a tenant route without a case fails CI)                               |
| frontend      | `services/productService.ts`                                  | the real service behind #35's `IProductService` (ADR 0020 part 4)                                    |

`createdBy` is `req.auth.userId`, passed by the Controller; never taken from the body.

### 4. Permissions (needs ADR 0033, #72)

- `product.view` for both `GET` routes; `product.manage` for `POST` and `PATCH`.
- Until ADR 0033's check exists, the routes are **not mounted**. Mounting them without the check would let any
  signed-in staff member change prices.

### 5. Invariants touched

- **Tenancy:** every statement in the request transaction (ADR 0005); RLS on `product` (#105); `business_id`
  from the scope, never from the body.
- **Money as strings:** `sellPrice` is `moneySchema` in and out; no arithmetic on it here.
- **Concurrency:** the edit is one conditional `UPDATE` (#124); two parallel edits of one version, one wins.
- **Hidden fields:** no cost on any product response (ADR 0020 section 3).

## Tests to write first

1. Shared: `productCreateSchema` refuses a number for `sellPrice`, `"12.5"`, and a negative price;
   `productEditSchema` refuses `code`, `tracking`, and an empty change.
2. Shared: no product response schema has a key containing `cost` (ADR 0020 test 10).
3. Manager (fake Query): `edit` returning null with the product present is `409 product.version_conflict`; absent
   is `404 product.not_found`.
4. Api (Supertest, real Postgres): create → `201` with `Location` and `version: 1`; the same code again → `409`.
5. Api: edit with the read version → `200`, `version: 2`; again with version 1 → `409`, and the row is unchanged.
6. Api: two parallel `PATCH` requests with the same version → one `200`, one `409`.
7. Isolation: a user of business X gets `404` for Y's product id on `GET` and `PATCH`, and never sees it in the list.
8. Isolation: `POST` with a `businessId` in the body is refused (`.strict()`); the row lands in the scope's business.
9. Permissions: without `product.manage`, `POST` and `PATCH` are `403` and write nothing.

## PR split

| Part | Branch                 | Contents                                          | Size (approx.) | Needs first          |
| ---- | ---------------------- | ------------------------------------------------- | -------------- | -------------------- |
| 1    | `feat/product-schemas` | detail, create and edit schemas; tests 1, 2       | ~150           | #34                  |
| 2    | `feat/product-manager` | contract and `ProductManager`; test 3             | ~200           | part 1, #124         |
| 3    | `feat/product-routes`  | Controller, Routes, isolation cases; tests 4 to 9 | ~350           | part 2, A6, ADR 0033 |

## Blocked by

- **A6** (ADR 0051, #120), for `req.tenant`; **ADR 0033** (#72), for the permission check; **#34**, for the list
  schemas.

## Consequences

- Products can be managed over HTTP once A6 and ADR 0033 land; until then parts 1 and 2 can merge on their own.
- Every later product field (images, price history) extends these schemas and the edit's column list, and #105's
  column grant with it.

## Open questions

1. **Munif:** may a product's `unit` change after stock exists? Recommended: yes in release 1. It is a label, and
   quantities don't convert.
2. **Both:** is `product.manage` one permission, or should price changes be separate (`product.price`)?
   Recommended: one for release 1, and split it when a role needs to edit names without prices.

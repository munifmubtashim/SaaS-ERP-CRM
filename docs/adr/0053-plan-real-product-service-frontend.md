# 0053: Plan for the real product service in the frontend

| Field               | Value                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| Status              | Proposed                                                                                        |
| Date                | 2026-11-23                                                                                      |
| Deciders            | Munif, Farhan                                                                                   |
| Spec / roadmap refs | spec O-04, P-05, P-10; ADR 0007 (#16), ADR 0051 (#120, #128, #129), ADR 0052 (#125, #130, #131) |

## Context

The product API exists on draft branches: `GET`, `POST` and `PATCH /v1/products` (#131). Each tenant request must
send `X-Business-Id` and `X-Branch-Id`, which are verified against the user's scopes (#128, #129). The frontend can't
use it yet:

- `ProductService` (#35) has `list` only, and `createServices` uses `MockProductService`.
- No frontend code sends `X-Business-Id` or `X-Branch-Id`. `activeScopeStore` (#12) holds a business and branch, but
  nothing turns them into headers.
- The business and branch ids come from `MockOrganizationService`, because `GET /v1/me/businesses` (M2) isn't
  built. Real calls with mock ids would answer `404`.
- No screen creates or edits a product.

#35's plan covers the mock list screen only ("running on MockProductService until GET /v1/products exists"). Nothing
plans the steps above, so this ADR does. It is a plan only; nothing is built.

## Decision

1. **Tenant headers in one place.** `HttpClient` takes an `activeScope` source (`() => {businessId, branchId} |
null`) from `createServices`. When the source returns a scope, every request sends `X-Business-Id` and
   `X-Branch-Id`; services never set them. With no active scope, a tenant call isn't sent. The UI shows the
   "choose a business" state instead.
2. **Real ids first.** `GET /v1/me/businesses` (a `user` route, ADR 0007: no tenant headers) lists the businesses
   and branches the user can open. It is built before the switch below, as `OrganizationService.myBusinesses` and
   its API route. It needs its own small plan (AuthQuery can verify but not list, ADR 0051 as built). Until then,
   the product service stays on the mock in development.
3. **ProductService** gains `get(id)`, `create(input)` and `edit(id, edit)` over the shared schemas (#130).
   `createServices` uses the real `ProductService` in every build once (2) exists, the same pattern as #118's
   `AuthService`. The mock stays for development only while (2) is missing.
4. **Screens:** a create form and an edit form (React Hook Form + the shared Zod schemas). Shown only to `owner` and
   `business_manager`, using `hasAnyRole` from shared; the API refuses everyone else anyway. A stale edit shows the
   `product.version_conflict` message and reloads. All strings in `i18n/en.ts` and `bn.ts`. Token colours only;
   read `erp-ui-design` first.

## Tests to write first

1. `HttpClient`: with an active scope, every request carries both headers; without one, a tenant call is refused
   before `fetch`.
2. `createServices`: the real `ProductService` in a production build; the mock only in development, until (2).
3. `ProductService`: `create` posts the shared create body and parses the detail; `edit` sends the version; a
   `409` becomes the version-conflict state.
4. Forms: hidden for branch manager, accountant and cashier; a money field accepts `"2500.50"` and refuses
   `2500.5`; en and bn have the same keys (the existing i18n test).

## PR split

| Part | Contents                                           | Needs first           |
| ---- | -------------------------------------------------- | --------------------- |
| 1    | `HttpClient` tenant headers; test 1                | #12                   |
| 2    | `GET /v1/me/businesses` plan, then build           | its own ADR           |
| 3    | `ProductService` get/create/edit, the switch; 2, 3 | parts 1, 2; #35; #131 |
| 4    | create and edit forms; test 4                      | part 3                |

## Consequences

- The browser works on real data only once (2) lands. Before that, product screens in development use the mock and
  production builds have no product screen.
- The tenant headers can't be forgotten by a service, because only `HttpClient` sets them.

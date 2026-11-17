# 0007: The active business and branch come from each request

| Field               | Value                                                                        |
| ------------------- | ---------------------------------------------------------------------------- |
| Status              | **Proposed**                                                                 |
| Date                | 2026-11-17                                                                   |
| Deciders            | Munif, Farhan                                                                |
| Spec / roadmap refs | spec O-04 (active business); roadmap 4.2; ADR 0005 (Q2, follow-up (a) on #3) |

## Context

ADR 0005 says every write runs with exactly one **active business**, and only routes marked
`{ readOnly: true }` may run with several. It does not say where the active business comes from. Farhan
raised this on #3 as follow-up (a), to settle before M2, the business switcher (#12) and F1b.

The forces:

- A user can belong to several businesses and branches. The frontend keeps the chosen business and branch in
  `activeScopeStore` (#12).
- An owner often has two businesses open side by side, in two browser tabs. Each tab must keep working in
  its own business.
- The server must never trust the client's choice on its own. A forged or stale id must not reach the tenant
  transaction, and the reply must not reveal which business ids exist.
- `tenantMiddleware` is still a placeholder. M2 replaces it with the real lookup.

## Decision

1. **The frontend sends the active business on every tenant request** in the header `X-Business-Id`, and the
   active branch in `X-Branch-Id` on routes that need one (branch-scoped writes, such as an invoice or a
   payment). The frontend's HTTP client adds both from `activeScopeStore`, so no feature code sets them by hand.
2. **Three route kinds.** Every module router is mounted with one of:
   - `'public'`: no sign-in (login, `/health`);
   - `'user'`: signed in, no business (`/v1/me/...`, such as `GET /v1/me/businesses`). It reads only the
     caller's own rows and ignores `X-Business-Id`;
   - `'tenant'`: signed in and scoped to a business.

   `buildRoutes` attaches the middleware per kind: `authMiddleware` for `'user'` and `'tenant'`, and
   `tenantMiddleware` for `'tenant'` only. It is no longer mounted on all of `/v1`.

3. **`tenantMiddleware` reads the header and checks membership.** It builds `req.tenant` only from what the
   user's memberships allow. The header only says which of the user's own businesses to use; it never grants
   access. Memberships are read only through **`AuthQuery`**, the one class allowed to read without a tenant
   scope (ADR 0005, lint rule).
4. **The tenant route wrapper checks the route's own rules.** `wrap.tenant(handler, options)` (#8) knows the
   route's options: `{ readOnly: true }` (ADR 0005) and **`{ branch: 'required' }`**, set on every
   branch-scoped route. Both options can be combined.
5. **Answers, and where each is checked:**

   | Request                                                           | Answer                                 | Checked in           |
   | ----------------------------------------------------------------- | -------------------------------------- | -------------------- |
   | `X-Business-Id` missing, empty or not a UUID (or list)            | `400 VALIDATION_FAILED`                | `tenantMiddleware`   |
   | More businesses in the list than the cap                          | the shared over-limit error (ADR 0005) | `tenantMiddleware`   |
   | A business id that does not exist                                 | `404 NOT_FOUND`                        | `tenantMiddleware`   |
   | A business id that exists but the user is not a member of         | `404 NOT_FOUND`                        | `tenantMiddleware`   |
   | A list with any business the user may not see                     | `404 NOT_FOUND`, as whole              | `tenantMiddleware`   |
   | `X-Branch-Id` not a UUID                                          | `400 VALIDATION_FAILED`                | `tenantMiddleware`   |
   | A branch outside the active business, or not allowed for the user | `404 NOT_FOUND`                        | `tenantMiddleware`   |
   | Several businesses on a route not marked `{ readOnly: true }`     | `400 VALIDATION_FAILED`                | tenant route wrapper |
   | `X-Branch-Id` missing on a route marked `{ branch: 'required' }`  | `400 VALIDATION_FAILED`                | tenant route wrapper |

   "Does not exist" and "not a member" give the same answer, the same body and no difference the caller can
   measure on purpose, so the ids of other businesses cannot be probed. The 404 body never repeats the
   refused id. Every refusal happens before the tenant transaction opens.

6. **Branches.** `req.tenant.branchIds` lists the branches the user may use in the scope's businesses (ADR
   0005: never "all branches" by omission). With one business, that is its allowed branches. On a read-only
   route with several businesses, it is the allowed branches of every listed business. On a route marked
   `{ branch: 'required' }`, `X-Branch-Id` must be one of them, and it becomes the branch the document is
   written to.
7. **Read-only group routes** (ADR 0005 Q2) may send several businesses as a comma-separated
   `X-Business-Id`, **at most 20** (a constant in `shared`). Each must pass the membership check; one failure
   refuses the whole request. These routes run `READ ONLY`.
8. **The active business is per tab.** The frontend keeps it in `sessionStorage`, one value per tab, so two
   tabs can work in two businesses and a switch in one tab never changes another.
9. **The last-used business only seeds a new tab.** It is kept in `localStorage` and on the server (on the
   user's session), so a new tab or a new device starts there. The server writes it **only on an explicit
   switch**, through a `'user'` route (`PUT /v1/me/last-business`) and `AuthQuery`, outside any tenant
   transaction. It is never written on an ordinary request, so read-only routes stay write-free. The server
   never falls back to it: a tenant request without `X-Business-Id` is a `400`.
10. **No HTTP caching of tenant data.** The same URL returns different data per header, so the wrapper sends
    `Cache-Control: no-store` on every tenant response.
11. **Idempotency-Key is unique per business** (ADR 0005 Q6): the key record carries `business_id`, so the same
    key in two businesses never collides or replays across them.
12. **Logs.** The request log records the business and branch ids from `req.tenant`, never the raw header
    when it was refused.

## Alternatives considered

- **The active business stored in the session.** One value per login, so two tabs would overwrite each
  other's business, and a write could land in the business the other tab chose. Rejected. (The session
  keeps only the last-used business, as a starting point; step 9.)
- **The business in the URL path** (`/v1/b/:businessId/invoices`). Explicit and cache-friendly, but every
  route and every isolation case changes shape, group routes need a different form anyway, and the frontend
  must build every URL with it. Rejected for now; the header gives the same safety with less churn.
- **A subdomain per business.** Needs wildcard DNS and certificates, and a business switch reloads the app.
  Rejected.
- **Trusting the header without a membership check.** Never acceptable: it would let any user pick any
  business.

## Consequences

- Every tenant request carries one or two extra headers. The frontend's HTTP client owns them. Public and
  `'user'` routes (login, `GET /v1/me/businesses`) send none and ignore them.
- Route kinds become `'public' | 'user' | 'tenant'`. When this is accepted, CLAUDE.md's routing rule and the
  isolation suite add `'user'`: a `'user'` route must never accept a business id.
- Checks live in two places, `tenantMiddleware` and the tenant route wrapper; the table in step 5 is the map.
  A branch-scoped route that forgets `{ branch: 'required' }` would fall back to all allowed branches, so each
  such route's isolation case also sends no `X-Branch-Id`.
- `tenantMiddleware` reads memberships on every tenant request. It is one indexed read by user id; cache it
  per session later only if the Phase 2 measurements ask for it.
- If the API is ever served from another origin, CORS must allow `X-Business-Id` and `X-Branch-Id`. The demo
  and production serve the frontend from the same origin, so no CORS change is needed now.
- Any client-side cache (TanStack Query keys) must include the active business, or one tab could show
  another business's data after a switch.
- `Cache-Control: no-store` means no browser or proxy caching of tenant responses.
- Undoing it: the header is read in one middleware and set in one HTTP client. Moving to path parameters
  later changes those two places and the route definitions.

## Tests M2 must write first

Integration, real PostgreSQL, through `tenantMiddleware`, the tenant route wrapper and a tenant route:

1. No `X-Business-Id` → 400. An empty value and a non-UUID → 400.
2. A random UUID that is no business → 404. A real business the user is not a member of → 404, with the
   same body as the previous case.
3. A member's business → 200, and the tenant transaction's `app.business_ids` is exactly that business.
4. `X-Branch-Id` of a branch in another business, or a branch the user may not use → 404.
5. A branch-scoped write without `X-Branch-Id` → 400. With a valid one, the row is written to that branch.
6. Several businesses on a write route → 400, and no transaction opens.
7. Several businesses on a read-only route → 200 with only those businesses. One foreign business in the
   list → 404 for the whole request, and no rows returned.
8. Two tabs: two requests from the same session with different `X-Business-Id` values, run in parallel, each
   see only their own business.
9. The last-used business is never used as a fallback: a request without the header is still 400.
10. A refused header is not written to the log.
11. `GET /v1/me/businesses` works without `X-Business-Id`.
12. `X-Business-Id` is ignored on public routes.
13. The 404 body does not contain the refused id.
14. A membership removed during a session gives a 404 on the next request.
15. More businesses than the cap on a read-only route gives the shared over-limit error.
16. A tenant response carries `Cache-Control: no-store`.

Frontend (unit):

17. Two tabs keep two businesses: switching in one `sessionStorage` leaves the other unchanged, and a new tab
    starts from the last-used business in `localStorage`.

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

- A user can belong to several businesses and branches. The frontend already keeps the chosen business and
  branch per device (`activeScopeStore`, #12).
- An owner often has two businesses open side by side, in two browser tabs. Each tab must keep working in
  its own business.
- The server must never trust the client's choice on its own. A forged or stale id must not reach the tenant
  transaction, and the reply must not reveal which business ids exist.
- `tenantMiddleware` is still a placeholder. M2 replaces it with the real lookup.

## Decision

1. **The frontend sends the active business on every tenant request** in the header `X-Business-Id`, and the
   active branch in `X-Branch-Id` on routes that need one (branch-scoped writes, such as an invoice or a
   payment). The frontend's HTTP client adds both from `activeScopeStore`, so no feature code sets them by hand.
2. **`tenantMiddleware` checks the header against the user's memberships** and builds `req.tenant` only from
   what the memberships allow. The header only says which of the user's own businesses to use; it never
   grants access. The membership read is an unscoped read by the user's own id (ADR 0005, login and public
   routes).
3. **Answers:**

   | Request                                                             | Answer                    |
   | ------------------------------------------------------------------- | ------------------------- |
   | `X-Business-Id` missing, empty or not a UUID                        | `400 VALIDATION_FAILED`   |
   | `X-Branch-Id` missing on a route that needs a branch, or not a UUID | `400 VALIDATION_FAILED`   |
   | A business id that does not exist                                   | `404 NOT_FOUND`           |
   | A business id that exists but the user is not a member of           | `404 NOT_FOUND`           |
   | A branch outside the active business, or not allowed for the user   | `404 NOT_FOUND`           |
   | Several business ids on a route not marked `{ readOnly: true }`     | `400 VALIDATION_FAILED`   |
   | A list on a read-only route with any business the user may not see  | `404 NOT_FOUND`, as whole |

   "Does not exist" and "not a member" give the same answer, the same body and no difference the caller can
   measure on purpose, so the ids of other businesses cannot be probed. The refusal happens before any tenant
   transaction opens.

4. **Branches.** `req.tenant.branchIds` lists the branches of the active business the user may use (ADR 0005:
   never "all branches" by omission). When the route needs a branch, `X-Branch-Id` must be one of them, and
   it becomes the branch the document is written to.
5. **Read-only group routes** (ADR 0005 Q2) may send several businesses as a comma-separated
   `X-Business-Id`. Each must pass the membership check; one failure refuses the whole request. These routes
   run `READ ONLY`.
6. **The session remembers only the last-used business** as a default for the frontend to start with (for
   example after login). The server never falls back to it for a request: a tenant request without
   `X-Business-Id` is a `400`. So each tab works in the business it shows, and a switch in one tab never
   changes another.
7. **Logs.** The request log records the business and branch ids from `req.tenant`, never the raw header
   when it was refused.

## Alternatives considered

- **The active business stored in the session.** One value per login, so two tabs would overwrite each
  other's business, and a write could land in the business the other tab chose. A switch also needs a
  server write. Rejected.
- **The business in the URL path** (`/v1/b/:businessId/invoices`). Explicit and cache-friendly, but every
  route and every isolation case changes shape, group routes need a different form anyway, and the frontend
  must build every URL with it. Rejected for now; the header gives the same safety with less churn.
- **A subdomain per business.** Needs wildcard DNS and certificates, and a business switch reloads the app.
  Rejected.
- **Trusting the header without a membership check.** Never acceptable: it would let any user pick any
  business.

## Consequences

- Every tenant request carries one or two extra headers. The frontend's HTTP client owns them, and requests
  made before a business is chosen (login, `GET /v1/me/businesses`) are public or unscoped and send none.
- `tenantMiddleware` reads memberships on every tenant request. It is one indexed read by user id; cache it
  per session later only if the Phase 2 measurements ask for it.
- If the API is ever served from another origin, CORS must allow `X-Business-Id` and `X-Branch-Id`. The demo
  and production serve the frontend from the same origin, so no CORS change is needed now.
- Any client-side cache (TanStack Query keys) must include the active business, or one tab could show
  another business's data after a switch.
- Undoing it: the header is read in one middleware and set in one HTTP client. Moving to path parameters
  later changes those two places and the route definitions.

## Tests M2 must write first

Integration, real PostgreSQL, through `tenantMiddleware` and a tenant route:

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
9. The session's last-used business is never used as a fallback: a request without the header is still 400.
10. A refused header is not written to the log.

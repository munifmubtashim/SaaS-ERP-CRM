# ADR 0007: where the active business comes from

## What was decided

Every tenant request names its business in the `X-Business-Id` header, and its branch in `X-Branch-Id` where
the route needs one. `tenantMiddleware` checks the header against the user's memberships and builds
`req.tenant` only from them; the tenant route wrapper checks each route's own rules (`readOnly`,
`branch: 'required'`). The active business is per tab (`sessionStorage`); the last-used business only seeds a
new tab, never as a fallback.

## Request flow

1. The user picks a business and branch in the header switcher; `activeScopeStore` keeps them for this tab
   (`sessionStorage`), and the switch also updates the last-used business.
2. The frontend's HTTP client adds `X-Business-Id` (and `X-Branch-Id`) to every tenant request.
3. `tenantMiddleware` reads the user's memberships (unscoped, by the user's own id).
4. Missing or malformed header: 400. Unknown business or not a member: 404, the same answer for both.
5. Otherwise it sets `req.tenant`. The route wrapper checks the route's options (several businesses only when
   read-only, a branch when required) and opens the tenant transaction (ADR 0005).

## Why each part exists

- **Header, not session:** two tabs can work in two businesses without overwriting each other.
- **Membership check:** the header only chooses among the user's own businesses; it never grants access.
- **Same 404 for "missing" and "not yours":** nobody can probe which business ids exist.
- **400 for no header:** a silent fallback could write into a business the user is not looking at.

## Five questions an interviewer could ask

1. Why is a header safer here than storing the active business in the session?
2. Why return 404 rather than 403 for a business the user is not a member of?
3. What stops a user from sending another company's business id?
4. How do the read-only group routes differ, and why do they run `READ ONLY`?
5. What would break in the frontend cache if the query keys left out the business?

# Org, auth and dashboard UI, part A: shared schemas

## What was built

The shapes the login screen, the business and branch switcher, and the owner dashboard exchange with the API.
They live in `packages/shared`, so the frontend (with mock services now) and the backend (when its routes are
built) validate the same thing. No screens, no routes, no tables in this part.

- **Login:** `loginRequestSchema` takes a login (a phone in `+880…` form or an email) and a password of 8 to 128
  characters. `sessionSchema` is what comes back: the user's id and name, and when the session ends.
- **Businesses:** `myBusinessesResponseSchema` lists the businesses a user may work in, each with at least one
  branch. `activeScopeSchema` is the one business and one branch the user is working in now.
- **Owner dashboard:** `ownerDashboardSchema` has total dues and collections today, the same two figures per
  business, and `asOf`, the time the figures were calculated.

## Request flow (once the screens and routes exist)

1. The login form checks its input with `loginRequestSchema` before sending anything.
2. The service sends it; the reply is checked with `sessionSchema`. Unknown keys are dropped.
3. The shell asks for the user's businesses; the reply is checked with `myBusinessesResponseSchema`.
4. The user picks a business and branch; the choice is stored as an `activeScope`.
5. The dashboard asks for figures; the reply is checked with `ownerDashboardSchema`. Money arrives as text such
   as `"1234567.50"` and is shown with lakh grouping by `formatMoneyBDT`.
6. If the backend ever sends a different shape, the parse fails loudly instead of showing wrong numbers.

## Why each file exists

- `shared/src/schemas/auth.schema.ts`, `types/auth.types.ts`: login and session.
- `shared/src/schemas/organization.schema.ts`, `types/organization.types.ts`: businesses, branches, active scope.
- `shared/src/schemas/report.schema.ts`, `types/report.types.ts`: the owner dashboard.
- `*.schema.test.ts`: one test file per module, with obviously fake sample ids and data.

## Five questions an interviewer could ask

1. Why put these schemas in a shared package instead of writing them twice?
2. Why is money a string with two decimals and not a number?
3. Why does the session schema strip unknown keys, and what could leak without that?
4. Why must every business have at least one branch, and where else is that enforced?
5. Why does the dashboard carry `asOf`?

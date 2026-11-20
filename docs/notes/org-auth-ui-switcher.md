# Org, auth and dashboard UI, part C: business and branch switcher

## What was built

A control in the header that answers "which business and branch am I working in?" on every screen (spec O-04).
The one action is to switch. It runs against a mock organization service until `GET /v1/me/businesses` exists (M2).

- **Switcher:** two labelled dropdowns, Business and Branch. Switching business moves to that business's first
  branch. States: loading, could not load (with Try again), and no business assigned yet.
- **Active scope store:** the chosen business and branch, one per browser tab (ADR 0007): `sessionStorage`
  for this tab, and the last-used choice in `localStorage` to start a new tab. A remembered choice the user
  may no longer use falls back to the first business and its first branch.
- **Why it matters:** ADR 0005 says every write runs with exactly one active business. This is where the user
  picks it; later the API reads it to set the tenant scope.

## Request flow

1. The shell renders `ScopeSwitcher` in the header.
2. `useMyBusinesses` asks `organization.myBusinesses()` through `IOrganizationService` (today the mock).
3. The answer is a list of businesses, each with at least one branch (the shared schema guarantees it).
4. The hook compares the remembered choice with the list. Still allowed: keep it. Otherwise: first business,
   first branch. Empty list: clear it and say no business is assigned.
5. The user picks another business or branch; `activeScopeStore` saves it and every screen sees the change.
6. When the M2 API exists, `createServices` switches to `OrganizationService`, which already calls the route.

## Why each file exists

- `features/organization/ScopeSwitcher.tsx`: the header control; renders only.
- `features/organization/useMyBusinesses.ts`: loading the list and keeping the active choice valid.
- `store/activeScopeStore.ts`: the active business and branch for this tab, plus the last-used one.
- `services/organizationService.ts`: `IOrganizationService` and the HTTP class for the future route.
- `services/mock/MockOrganizationService.ts`: two sample businesses with two branches each.
- `app/AppShell/AppShell.tsx`: puts the switcher in the header.
- `i18n/en.ts`, `i18n/bn.ts`: every string in English and Bangla.

## Five questions an interviewer could ask

1. Why must the client re-check a remembered business against the list from the server?
2. Is hiding a business in the dropdown enough to stop a user from writing to it? Where is the real check?
3. Why reset the branch when the business changes?
4. Why is the active business per tab, and what would go wrong if two tabs shared one value?
5. How would you make every screen reload its data when the business changes?

# 0033: Plan for permission checks and hidden fields (B4 to B6)

| Field               | Value                                                                          |
| ------------------- | ------------------------------------------------------------------------------ |
| Status              | Proposed                                                                       |
| Date                | 2026-11-21                                                                     |
| Deciders            | Munif, Farhan                                                                  |
| Owner               | Munif (Auth; plan rows B4, B5, B6)                                             |
| Spec / roadmap refs | spec U-03, RP-04, C-01, D-03, 20.2 test 6; ADR 0008 (#27), 0007, #26; plan 2.5 |

## Context

**Cost, profit and salary must be hidden from roles that may not see them** (plan 2.5). ADRs 0020 to 0022 already
store costs, and D9 will store salaries. And every route needs a permission check against the **active** business
and branch, not just a login.

The feature plan reserved ADR 0012 for this; that number is now the module contracts ADR. This is a permissions
change, so CLAUDE.md requires an agreed plan. No code is in this PR.

## Decision

**Scope:**

- a permission check on every tenant route;
- redaction of tagged fields in every response and export.

### 1. Permission check (B6)

- **Every tenant route declares one permission code** in its route options, for example
  `{ permission: 'party.customer.view' }`. A route-coverage test fails for a tenant route without one.
- **The check:** the route wrapper (#8) checks the code against the caller's roles **for the active business and
  branch** (`user_scope`, resolved by A6, ADR 0007), using the role mapping seeded from #26.
- **Refusal:** `403 FORBIDDEN`, recorded as a `denied` event (ADR 0032).

### 2. Hidden fields (B4, B5)

- **Tags:** shared Zod response schemas tag sensitive fields, for example `.meta({ sensitive: 'cost' })`. The exact
  Zod 4 metadata API (`.meta()` or a registry) is confirmed against Zod's docs when the PR is written.
- **Registry:** each tag maps to a permission: `cost` → `product.cost.view`, `profit` → `report.profit.view`,
  `salary` → `accounting.salary.view` (#26).
- **`redactSensitive(body, schema, permissions)`:** run by the route wrapper on every response. A field the caller
  may not see is **absent** from the JSON, not `null`.
- **Exports** are built from the same responses, so they're redacted the same way. Screens hide a column when the
  field is absent.
- **A report whose only purpose is a hidden figure** needs its permission to open at all.

## Invariants touched

Permissions; tenancy (the check uses the active scope).

## Tests to write first

1. **Generic, per tag:** without the permission, the field is absent from the JSON and from the CSV export; with
   it, the field is present.
2. A test fails if any shared schema has a key named like `cost`, `profit`, `margin` or `salary` without a tag.
3. **Spec 20.2 test 6:** a Branch Manager of branch 1 is refused on branch 2 by URL.
4. **The active scope decides:** the same user is allowed in business X, where they hold the role, and refused in
   Y, where they don't.
5. A tenant route without a `permission` option fails the route-coverage test.
6. A refused request writes one `denied` event (ADR 0032) and changes nothing.

## Dependencies

- #26 (codes and roles), A4 (`role_permission`, `user_scope`), A6 (active scope), #8 (route wrapper).
- ADR 0032, for the `denied` event.

## Size and PR split

| Part | Contents                                                                   | Size |
| ---- | -------------------------------------------------------------------------- | ---- |
| 1    | the permission check in the wrapper, route options, tests 3 to 6           | ~300 |
| 2    | tags, the registry, `redactSensitive`, tests 1 and 2 (shared: both review) | ~350 |

## Consequences

- **Easier:** a new hidden field is one tag; a new route can't ship without a permission.
- **Harder:** every existing tenant route must be given a permission code when part 1 merges.
- **Undo:** remove the option and the redaction step; no schema change.

## Open questions (with recommended answers)

1. **Both:** must every tenant route declare a permission (recommended), or may read-only routes default to "any
   role in scope"?
2. **Both:** a hidden field absent (recommended) or `null`?
3. **Munif:** role mappings fixed from #26 for release 1 (recommended), with per-business editing later?
4. **Farhan:** do Party's per-kind codes (#52) need anything beyond this check? Recommended: no.

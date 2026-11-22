# 0050: Forced RLS on the access tables, and the login lookup

| Field               | Value                                                                                                                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status              | Proposed                                                                                                                                                                                  |
| Date                | 2026-11-22                                                                                                                                                                                |
| Deciders            | Munif (Auth owner); Farhan to review, because it changes ADR 0008 which he approved on #27                                                                                                |
| Supersedes          | **ADR 0008 section 2, in part** (the "No tenant RLS" rule below) and **ADR 0018 section 1's "No tenant RLS" bullet** for `auth_session` (section 6); adds to ADR 0009 part 3 and ADR 0018 |
| Spec / roadmap refs | spec U-04; CLAUDE.md tenancy rules; ADR 0005, 0008, 0009, 0018; migrations `auth_access` and `auth_session`                                                                               |

## Context

ADR 0008 section 2 decided:

> **No tenant RLS on `app_user`, `role`, `role_permission` and `user_scope`.** They are read before a scope
> exists: login, and `tenantMiddleware` building `req.tenant`. That read goes through `AuthQuery` on the
> unscoped path (ADR 0005), filtered by the authenticated user's own id. A tenant policy on these tables
> would make that read fail, because the RLS functions raise when no scope is set.

It accepted the trade-off that a missing `organization_id` filter in any query would leak names, emails, phones
and password hashes across organizations, caught only by review and tests. Before building these tables (ADR 0009
part 3), Munif decided on 22 Nov that the database should enforce the organization boundary here too, as it
does on every other tenant table, and that the one read that really happens before a scope (login) gets its own
narrow path.

## Decision

This ADR **supersedes ADR 0008 section 2, in part**: the sentence quoted above, and the "Trade-off, accepted"
paragraph after it, no longer apply. The rest of section 2 stands (one organization per user, `user_scope` as the
place a role is held, Owner-only group scope, `staff` is not a user, custom roles).

### 1. Forced RLS, scoped by organization

- `app_user`, `role`, `role_permission` and `user_scope` have RLS **enabled and forced**.
- `erp_app` policies are `TO erp_app`, one per granted command (`SELECT`, `INSERT`, `UPDATE`), each requiring
  `app.organization_id`: directly on `app_user` and `role`, through the role on `role_permission`, and through the
  user on `user_scope`.
- The migration owner gets `TO CURRENT_USER` policies for `SELECT`, `INSERT` and `UPDATE` with the same
  organization check, so the seed and test fixtures write only inside the organization they set (ADR 0008
  section 4). **No `DELETE` policy** for any role, and a `BEFORE TRUNCATE` trigger refusing `TRUNCATE` on all four
  tables and on `permission`.
- `permission` stays a global, read-only catalogue: no RLS, `SELECT` only for `erp_app`, seeded by the owner.

### 2. The login lookup (ADR 0018 section 4)

Login is the only read before any organization is known.

- `AuthQuery.findUserForLogin(login)` opens its own short transaction and sets **only** `app.login_key`, with
  `set_config(..., true)` (transaction-local), to the lower-cased email or the E.164 phone.
- A new function `app_login_key()` returns that value, or `NULL` when it is unset. Unlike `app_organization_id()`
  it doesn't raise, because only `app_user`'s `SELECT` policy reads it, to choose a branch:
  - key set: the row whose `lower(email)` or `phone` equals the key. Both are unique, and an email must contain
    `@` while a phone is E.164 and never does, so one key can't match one user's email and another user's phone:
    **at most one row**, once both `auth_access` and `auth_session` are in (the email `CHECK` is in
    `auth_session`, section 6);
  - key unset: `organization_id = app_organization_id()`, which raises when no scope is set, as on every tenant
    table.
- With the key set, nothing else is reachable: `role`, `role_permission` and `user_scope` still need the
  organization and raise; an `UPDATE` of `app_user` raises; the key doesn't reach the next transaction on a
  pooled connection.
- After the password check, the login code works inside the found user's organization (A5, #45 part 2).

### 3. Login columns

- Email is unique across the system on `lower(email)` and optional; phone is unique across the system and
  optional; at least one is set (`CHECK`). This answers ADR 0018 open question 3 (Munif, 21 Nov).
- Phone is stored in one format only, E.164: `CHECK (phone ~ '^\+[1-9][0-9]{7,14}$')`.
- Creating a user with a taken email or phone answers `409 CONFLICT` with `user.email_taken` or
  `user.phone_taken` and a fixed message. **The answer is the same whether the other user is in the caller's
  organization or another one**, and it never contains another organization's id.

### 4. System roles are fixed

- A `BEFORE UPDATE` trigger on `role`, for every database role: no role's `code`, `is_system` or
  `organization_id` changes, and a system role is never renamed or deactivated.
- `erp_app` can't create a system role, and can't add a permission to one (its `INSERT` policies require
  `NOT is_system`). Custom roles can be renamed and deactivated.
- **The seed creates a new organization's five system roles and their permissions until onboarding is
  designed.** (Munif, 22 Nov; this is the ADR 0009 part 4 seed.)
- **Only the system Owner role holds the whole group.** The `user_scope` trigger accepts a group scope (both
  `business_id` and `branch_id` null) only when the role has `is_system AND code = 'owner'`. The code alone isn't
  enough: `erp_app` can create a custom role coded `owner` (its `INSERT` policy only requires `NOT is_system`),
  for example in an organization the seed hasn't reached yet (Farhan, #94).

### 5. A permission leaves a custom role by deactivation

- `role_permission` has `is_active` (default `true`), like `user_scope`. A permission is never deleted from a
  role: it is deactivated, and can be reactivated. Permission checks count active rows only.
- `erp_app` has `UPDATE` on `role_permission.is_active` **only** (a column-level grant): never on `role_id`,
  `permission_code` or `created_at`. Its `UPDATE` policy, like its `INSERT` policy, requires a role in the caller's
  organization with `NOT is_system`, so a system role's permissions change only through the seed.

### 6. Sessions: `auth_session` (migration `auth_session`; Farhan agreed the four points on #102)

ADR 0018 section 1 kept sessions in PostgreSQL with no tenant RLS. Like the four access tables, `auth_session`
now has the organization boundary in the database, with its own narrow path for the one read that happens before
an organization is known: finding the session behind a cookie.

1. **Forced RLS.** `erp_app` policies `TO erp_app` for `SELECT`, `INSERT` and `UPDATE`; owner policies
   `TO CURRENT_USER`, organization only, with no session path. Without a session key, every policy needs
   `app.organization_id`, which raises when it is unset.
2. **The lookup is by token hash, through a transaction-local key.** `AuthQuery`'s session lookup sets **only**
   `app.session_key`, the hex SHA-256 of the cookie token, with `set_config(..., true)`. A new function
   `app_session_key()` returns it as `bytea`, or `NULL` when unset (a value that isn't hex raises). With the key
   set, the `SELECT` and `UPDATE` policies show only the row whose `token_hash` equals it, so `authMiddleware` can
   read the session and touch or revoke it before the organization is known. The key doesn't reach the next
   transaction on a pooled connection. A new session is inserted after the password check, inside the found
   user's organization.
3. **A session can't name a user of another organization.** A new `UNIQUE (id, organization_id)` on `app_user`,
   added by the `auth_session` migration (not by editing `auth_access`), and a composite foreign key
   `(user_id, organization_id) → app_user (id, organization_id)`.
4. **No `DELETE` on sessions, for any role.** A session ends by expiring or by `revoked_at`; rows stay. A retention
   job, run by the owner outside requests, removes old rows later. `TRUNCATE` is refused for every role.
   `erp_app` has `SELECT`, `INSERT`, and `UPDATE (last_seen_at, idle_expires_at, revoked_at)` only.

**Email format (Farhan, #102).** `app_user` gets `CHECK (position('@' in email) > 1)`: an email contains `@`, not
first. A phone is E.164 (`+` and digits), so no key can equal one user's email and another user's phone, and the
login path (section 2) matches at most one row. The `CHECK` is added by the `auth_session` migration, **not** by
`auth_access`, so `auth_access` isn't edited again.

**`auth_access` and `auth_session` merge in the same batch.** The "at most one row" guarantee needs both, and the
session path needs `app_user` with its new unique index. Neither reaches `main` without the other.

## Known trade-offs (accepted)

**(a) Any code running as `erp_app` can set `app.login_key` or `app.session_key` and then see one row it
shouldn't.** With `app.login_key` it sees that one user's full row, including `password_hash` and
`mfa_secret_enc`; with `app.session_key` it sees, and can touch or revoke, that one session. The keys are plain
transaction settings: the database can't tell `AuthQuery` from any other code on the same connection. Each shows
one row per key, so neither can list users or sessions. Anyone who knows an email or phone could read that user's
hash through a rogue query; a session needs its token's hash, which is never logged or sent (only the cookie holds
the token). **The only guard is that `AuthQuery` alone may name the auth tables**: ADR 0008 test 15
(`AuthTablesOnlyInAuthQuery.int.test.ts`) fails when any other dal file names `app_user`, `role`,
`role_permission`, `user_scope`, `auth_session`, their models or their back-relation fields, and review checks
every change to `AuthQuery.ts`. Revisit with `SECURITY DEFINER` lookups that return only what login and the
session check need, if that guard ever proves too weak.

**(b) Login must give the same answer for an unknown user and a wrong password** (ADR 0018 section 4, steps 3 to
5). The lookup returns "no row" for an unknown login, which the login code must not reveal: the same `401`, the
same message, and the dummy-hash cost spent so the timing matches. ADR 0018 test 2 checks both.

**The timing is close, not identical.** A wrong password for a real account also runs `recordFailedLogin`, an
`UPDATE` of that user's counter, which an unknown login doesn't. The difference is one indexed single-row
`UPDATE`, small next to the argon2id verification both paths pay, but an attacker timing many attempts could
measure it (Farhan, #95). Accepted for release 1; the per-IP and per-account rate limits (ADR 0018) bound how many
attempts that takes. Revisit by running an equivalent write for an unknown login if it ever proves measurable in
production.

## Tests (written first)

`AuthAccess.int.test.ts` (47 tests), `AuthTablesOnlyInAuthQuery.int.test.ts` (test 15), and an
`auth_access` block in `OrganizationTreeOwner.int.test.ts` for an owner that is neither superuser nor
`BYPASSRLS`. They cover: RLS enabled and forced, no `DELETE` or unnamed-role policy; the login path and its
limits; organization isolation including guessed ids (ADR 0008 test 10); E.164 and the login `CHECK`; the
identical conflict answer; fixed system roles; a custom role coded `owner` refused a group scope;
`role_permission.is_active` (deactivate and reactivate on a custom role, nothing on a system role or another
organization's role, no other column writable); ADR 0008 tests 6 and 9; the source files matching the migration.

The `auth_session` migration's PR adds its own tests: RLS forced, the session path (right key one row, wrong key
none, the key gone after the transaction), organization isolation, the composite foreign key, the grants and no
`DELETE` or `TRUNCATE`, the owner path for an owner that is neither superuser nor `BYPASSRLS`, an email without `@`
refused, and a login key equal to one user's phone never matching another user's email.

## Consequences

- **Easier:** the organization boundary on users, roles and scopes is enforced by the database, not only by
  every query remembering its filter.
- **Harder:** every read of these tables needs `app.organization_id`, or the login key for the one login read.
  `tenantMiddleware` (A6) reads `user_scope` with the session's organization set (the session row carries it,
  ADR 0018), not with the user id alone.
- **Keep true:** only `AuthQuery` names the auth tables, `auth_session` included; only `findUserForLogin` sets
  `app.login_key`, and only `AuthQuery`'s session lookup sets `app.session_key`, each in its own transaction and
  each with `set_config(..., true)`; login answers never distinguish unknown users from wrong passwords; only the
  system Owner role holds group scope; permission checks read active `role_permission` rows only; `auth_access` and
  `auth_session` merge together.
- **Undo:** a new migration dropping the policies and disabling RLS on the four tables (and on `auth_session`)
  returns to ADR 0008 section 2 and ADR 0018 section 1 as written.

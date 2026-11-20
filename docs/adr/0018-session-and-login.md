# 0018: Sessions and login (for A4 and A5)

| Field               | Value                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| Status              | Proposed                                                                                       |
| Date                | 2026-11-21                                                                                     |
| Deciders            | Munif, Farhan                                                                                  |
| Owner               | Munif (Auth module; plan rows A4, A5)                                                          |
| Spec / roadmap refs | spec U-04, U-07, U-08; ADR 0005, 0008, 0009 (A4 section); `auth.schema.ts`; #11 (login screen) |

## Context

ADR 0009 says A4 needs its own session and login ADR, agreed before its part 3 (`auth_access`) starts. This is
that ADR. It decides:

- where sessions live;
- the cookie;
- lifetimes;
- lockout (U-04);
- the argon2id settings;
- which library hashes passwords.

**Already decided elsewhere:**

- **ADR 0008:** `app_user` has `password_hash` (argon2id), `failed_attempts`, `locked_until` and
  `mfa_secret_enc`. It is read **unscoped**, by `AuthQuery` only, because login runs before a tenant scope
  exists (ADR 0005).
- **`shared/src/schemas/auth.schema.ts`:** the login is an E.164 phone or an email; the password is 8 to 128
  characters; a session body is `{ user, expiresAt }`.
- **#11:** the login screen and session guard, on a mock service until A5.
- **Two-factor sign-in (U-07)** is Moto Mart phase 3 (plan Q18).

Auth is a permissions and migration area, so CLAUDE.md requires an agreed plan. No code is in this PR.

## Decision

### 1. Sessions live in PostgreSQL: table `auth_session`

| Column                | Notes                                                                        |
| --------------------- | ---------------------------------------------------------------------------- |
| `id`                  | uuid, `uuid_v7()`                                                            |
| `token_hash`          | bytea, unique: SHA-256 of the cookie token. The token itself is never stored |
| `user_id`             | foreign key to `app_user`                                                    |
| `organization_id`     | copied from the user, for the tenant scope                                   |
| `created_at`          |                                                                              |
| `last_seen_at`        | updated at most once every 5 minutes, so a request isn't always a write      |
| `idle_expires_at`     | `last_seen_at` + idle timeout                                                |
| `absolute_expires_at` | `created_at` + absolute timeout; never extended                              |
| `revoked_at`          | nullable                                                                     |
| `user_agent`          | first 200 characters, for the session list later (U-08)                      |

- **No tenant RLS**, like the other ADR 0008 access tables. It's read before a scope exists, by `AuthQuery`
  only, filtered by `token_hash` or by the user's own id. The dal test that keeps other Queries off the
  access tables (ADR 0008 test 15) covers it too.
- **Why PostgreSQL and not Redis:** revoking a session is transactional with a password change, nothing new
  runs in production, and the volume is tiny. Redis stays in Docker Compose for later.
- **`erp_app`:** `SELECT`, `INSERT`, and `UPDATE (last_seen_at, idle_expires_at, revoked_at)`. No `DELETE`;
  expired rows are cleaned by the worker later, as the owner.

### 2. The token and the cookie

- **Token:** 32 bytes from `crypto.randomBytes`, base64url. The cookie carries it; the database has only its
  hash, so a database leak doesn't hand out sessions.
- **Cookie:** `__Host-erp_sid`, with `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/` and no `Domain`. The
  `__Host-` prefix makes the browser refuse it without `Secure` or with a domain.
  - On `http://localhost` in development the name is `erp_sid`, without the prefix (set from `env.ts`).
  - Production always uses the prefix.
- **CSRF:**
  - `SameSite=Lax` stops the cookie on cross-site POSTs.
  - Every non-GET request must also carry an `Origin` header equal to the app's origin, or it is refused
    (`403 FORBIDDEN`).
  - No CSRF token is needed with both.
- **Never logged:** Pino redacts `req.headers.cookie`, `set-cookie`, `password`, and any `token` field (CLAUDE.md
  logging rule). A test checks the redaction paths.

### 3. Lifetimes

- **Idle:** 8 hours. A counter shift. Each request (throttled, section 1) extends it.
- **Absolute:** 7 days. Then sign in again, even if active.
- **New session on every login** (no session fixation).
- **Password change revokes every session of that user.** So does deactivating the user.
- **Logout** sets `revoked_at` and clears the cookie.

Both numbers are settings in `env.ts`. Open question 1.

### 4. Login and lockout (U-04)

1. `POST /v1/auth/login` (public, on `PUBLIC_ROUTES`), body checked by `loginRequestSchema`.
2. Find the user by `lower(email)` or by E.164 phone (unscoped `AuthQuery`).
3. **Unknown user:** verify the password against a fixed dummy hash anyway, so the response time doesn't say
   whether the account exists. Answer `401 UNAUTHENTICATED`, "Login or password is wrong."
4. **Locked** (`locked_until` in the future): the same `401` and the same message. No verification is run, but
   the dummy-hash cost is spent.
5. **Wrong password:** `failed_attempts + 1` with one atomic `UPDATE`. At 5, set `locked_until = now() + 15
minutes` and reset the counter. Same `401`.
6. **Right password:**
   - reset `failed_attempts`;
   - if the stored hash uses older argon2 settings, rehash and save;
   - create the session;
   - set the cookie;
   - return `sessionSchema`.
7. **Per-IP limit:** at most 20 login attempts per IP per 15 minutes, then `429 RATE_LIMITED`.
   - An in-process limiter for now: one API instance (ADR 0003, #17).
   - It moves to Redis when there is more than one instance.

The account lock and the IP limit together slow both one-account guessing and many-account spraying.

### 5. Password hashing: argon2id

- **Settings:** memory 19 MiB (`19456` KiB), time cost 2, parallelism 1. That's the OWASP minimum for argon2id.
  - Target: 50–150 ms per hash on the production machine, measured in the A5 PR.
  - Raised if the machine allows; the settings are encoded in each hash string, so old hashes keep working
    and are upgraded at the next login (step 6).
- **Library:** `@node-rs/argon2`. Its prebuilt Rust binaries cover Linux (glibc and musl) and macOS, so it
  needs no compiler at install time and no `postinstall` script.
  - The other candidate, `argon2` (node-argon2), builds or downloads native code at install.
  - The exact version is pinned in the A5 PR, after checking its current docs (Context7) and
    `npm audit` (`tools/` audit allowlist rules apply).
  - Open question 2.
- **Password rules:** 8 to 128 characters (the shared schema). The upper bound also caps hashing cost. A check
  against a common-password list is a later improvement, not release 1.

### 6. Who is calling: `authMiddleware`

For every request except `PUBLIC_ROUTES`:

1. Read the cookie and hash the token.
2. `AuthQuery.findActiveSession(hash)` (unscoped): not revoked, not past either expiry, user active.
3. Set `req.auth = { userId, organizationId, sessionId }`.
4. Extend the idle expiry if more than 5 minutes have passed.

No valid session → `401`. `tenantMiddleware` (A6) then builds `req.tenant` from `user_scope` (ADR 0008).

## Tests to write first (run to see them fail)

1. Login with the right email or phone sets a `__Host-` cookie with `HttpOnly`, `Secure` and `SameSite=Lax`,
   and returns the session body; the database has the token's hash, not the token.
2. Wrong password, unknown user and locked user all answer the same `401` and message. The unknown-user
   response time is within a set margin of a wrong-password one.
3. Five wrong passwords lock the account for 15 minutes; the right password then still fails; after the lock
   ends it works and the counter is reset.
4. Twenty-one attempts from one IP in 15 minutes → `429`.
5. Two parallel wrong passwords both count (atomic increment, not read-then-write).
6. Each login creates a new session; logout revokes it, and the old cookie then gets `401`.
7. A session past its idle or its absolute expiry gets `401`; activity extends idle but never absolute.
8. A password change revokes all of that user's sessions.
9. A non-GET request without a matching `Origin` → `403`.
10. Logs: a login request's log line contains no password, cookie or token (Pino redaction test).
11. A hash made with lower settings is upgraded after a successful login.
12. `AuthQuery` is the only dal file that names `auth_session` (extends ADR 0008 test 15).

## Migration steps (written here, applied in the PR, not now)

1. Separate from A4 part 3. A5 adds migration `auth_session` after `auth_access`.
2. Merge `main`; tell Farhan.
3. Add the model to `auth.prisma`.
4. `npm run db:migrate:new -- auth_session`; append grants and `REVOKE DELETE, TRUNCATE`; review the SQL.
5. `npm run db:migrate:check`; `db:migrate:deploy` locally; `test:integration`.

## Size and PR split (A5)

| Part | Branch              | Contents                                                                                                | Size (approx.) | Needs first                      |
| ---- | ------------------- | ------------------------------------------------------------------------------------------------------- | -------------- | -------------------------------- |
| 1    | `feat/auth-session` | migration, `AuthQuery` session methods, tests 6–8, 12                                                   | ~300           | A4 part 3 (`app_user`), ADR 0009 |
| 2    | `feat/auth-login`   | argon2 dependency, login, lockout, IP limit, `authMiddleware`, Origin check, redaction; tests 1–5, 9–11 | ~400           | part 1, #8 (wrappers)            |
| 3    | `feat/auth-ui-real` | #11's screen on the real service: swap the mock in `createServices`, cookie-based fetch                 | ~150           | part 2, #11 merged               |

## Blocked by

- **A4 part 3** (`app_user`, roles, scopes), planned in ADR 0009 (#31), which waits for this ADR.
- **#8** (route wrappers and `PUBLIC_ROUTES` handling).
- **#11** (login screen) for part 3.

## Consequences

- **Easier:** one server-side session store; logout and "revoke all" are immediate.
- **Harder:**
  - every authenticated request reads one row (indexed);
  - the per-IP limiter must move to Redis before a second API instance.
- **Keep true:**
  - only token hashes are stored;
  - the cookie is `HttpOnly` and `Secure` in production;
  - login errors never say which part was wrong.
- **Undo:** sessions are a table and a middleware; replacing them (for example with signed tokens) is a new
  ADR and a migration, with every user signing in again.

## Open questions

1. **Both:** idle 8 hours and absolute 7 days: right for counter staff and for the owner on a phone?
2. **Farhan:** `@node-rs/argon2` (recommended) or `argon2`? Either way a new runtime dependency, reviewed
   by both.
3. **Munif:** login by phone needs the phone unique across the system, like email (ADR 0008 makes only email
   unique). Add a unique index on `app_user.phone`, or log in by email only?
4. **Both:** after a lock, show the same "wrong" message (recommended, reveals nothing) or "Too many attempts,
   try again in 15 minutes" (friendlier, reveals that the account exists)?
5. **Both:** store the client IP on the session for the session list (U-08, after release 1)? It's personal
   data; recommended: not until U-08 is built.

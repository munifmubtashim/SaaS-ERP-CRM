# M1, part 1b-i: database pool size and time limits

## What was built

ADR 0005 makes every tenant request hold one database connection for its whole transaction. Two numbers then
matter: how many connections the api may open, and how long a request may keep one. This change makes both
configurable and puts hard limits inside PostgreSQL, so one slow or stuck request cannot hold a connection
forever.

- `DB_POOL_MAX` (default 10): the most connections one api process opens, so also the most requests that can
  be inside a transaction at the same moment.
- `DB_TX_TIMEOUT_MS` (default 10 000): Prisma rolls back a transaction that runs longer than this.
- On the `erp_app` database role: `statement_timeout = 5s` (one SQL statement) and
  `idle_in_transaction_session_timeout = 15s` (a transaction left open and doing nothing). PostgreSQL enforces
  these even if the Node process misbehaves, which is why they are the primary limit. All values are
  provisional and get measured in Phase 2.

## Request flow

1. The api starts. `server.ts` calls `loadEnv()`, which reads both settings and stops startup with a clear
   message if either is not a positive whole number.
2. `createManagers()` passes them to `createDbClient()`. It builds the pg pool with `max = DB_POOL_MAX` and the
   Prisma client with `transactionOptions = { maxWait: 2 s, timeout: DB_TX_TIMEOUT_MS }`.
3. A request opens a transaction. Prisma waits up to 2 s for a free connection, then fails.
4. The connection is logged in as `erp_app`, so the role's 5 s and 15 s limits already apply to it.
5. The request runs its queries. PostgreSQL cancels any single statement that runs over 5 s.
6. If the whole transaction runs past `DB_TX_TIMEOUT_MS`, Prisma rolls it back and returns the connection.
7. Otherwise it commits, and the connection goes back to the pool for the next request.

## Why each file exists

- `packages/backend/src/api/config/env.ts`: the only place environment variables are read and checked.
- `packages/backend/src/api/server.ts`: starts the api and hands the settings to the composition root.
- `packages/backend/src/businessLogic/src/index.ts`: `createManagers()`, the one place the database client is
  built, so the api never imports the dal.
- `packages/backend/src/dal/config/db.ts`: builds the pool and the Prisma client; owns the limits.
- `packages/backend/src/dal/index.ts`: exports the `DbClientOptions` type with the client.
- `docker/postgres/init/01-app-role.sh`: creates `erp_app` with its timeouts. CI runs the same script, so
  local and CI roles cannot drift apart.
- `.github/workflows/ci.yml`: a comment saying the role step must keep using that script.
- `.env.example`: documents the two settings.
- `api/test/unit/env.test.ts`: defaults, values from the environment, and bad values rejected.
- `dal/test/DbLimits.int.test.ts`: the role has both timeouts; `poolMax` really caps connections; an
  over-long transaction fails and the pool still works afterwards.

## Five questions an interviewer could ask

1. Why set timeouts on the database role as well as in Prisma? Which one would you trust more, and why?
2. What do users see when all `DB_POOL_MAX` connections are busy? How would you choose the number?
3. Why does `idle_in_transaction_session_timeout` matter when a request holds a transaction for its whole life?
4. A monthly report needs 30 seconds. How does it get past the 5 s limit without raising it for everyone?
5. Why does CI run the same init script as local Docker instead of its own SQL?

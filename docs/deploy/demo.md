# Demo deployment plan

A public demo for the interview slice (due 29 Nov 2026): the API and the built frontend in one container, and
one PostgreSQL database. **Sample data only. Nothing is deployed yet.** A person runs every step below; no
Claude session touches the hosted services or their secrets (CLAUDE.md, "Never do").

## What runs

- **One container** from the repo's `Dockerfile`. It builds the frontend, bundles the API, and serves both from
  one origin: pages at `/`, the API at `/api/...` (the same path the Vite proxy uses in development), health at
  `/health`. `STATIC_DIR=/app/public` turns on the frontend serving; it is set in the image.
- **One PostgreSQL 16 database** with two roles, as in development: the **owner** runs migrations, and
  **`erp_app`** (NOSUPERUSER, NOBYPASSRLS, owns nothing) is the only role the API connects as.
- No Redis, MinIO, Mailpit or worker: the slice does not use them yet.

## Options and costs

Prices checked on **17 Nov 2026**, in USD unless shown, before tax. "Third-party" means the figure comes from a
price-tracking article, not the provider's own page; check it on the provider's page before paying.

| Option                                           | App                                                         | Database                                                                           | About per month                                                                                                      |
| ------------------------------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **A. Render web service + Neon Postgres (Free)** | Render Starter, $7, always on [1]                           | Neon Free, $0: 100 CU-hours and 1 GB, scales to zero when idle [2]                 | **$7**                                                                                                               |
| B. Render web service + Render Postgres          | Render Starter, $7 [1]                                      | basic-256mb, $6 plus $0.30 per GB [1]                                              | $13 [1]                                                                                                              |
| C. Railway Hobby                                 | $5 plan, includes $5 of usage, then metered [3]             | Postgres on the same metered usage [3]                                             | about $22 for a web app and Postgres (third-party) [4]                                                               |
| D. Fly.io                                        | shared-cpu-1x 512 MB, $3.69 (US; more in other regions) [5] | Managed Postgres Basic, $38 plus $0.28 per GB [5]                                  | $43.67 (Fly's own example) [5]                                                                                       |
| E. Koyeb                                         | one Free instance (scales to zero after an hour idle) [6]   | Free Postgres has only 5 active hours a month; paid about $29.76 (third-party) [7] | $0 to about $30                                                                                                      |
| F. Hetzner Cloud VPS (CX23) with Docker Compose  | runs both on one server                                     | Postgres in Docker on the same server                                              | €3.49 on Hetzner's page [8]; third-party reports say €5.49 to €5.99 after mid-2026 changes, and stock is limited [9] |

Notes:

- Render's **Free** web service sleeps when idle, so the first visit waits for it to start. That is why A and B
  use Starter.
- Neon Free compute **scales to zero** after a few idle minutes; the first query after that wakes it, with a
  short delay. The API stays up, so `/` always answers.
- F is the cheapest always-on option, but we would run TLS, backups, OS updates and the firewall ourselves.

## Recommendation: option A (Render Starter + Neon Free), about $7 a month

- **Least to run.** Render builds the `Dockerfile` from GitHub, gives HTTPS, restarts on failure and checks
  `/health`. Neon runs the database. No server to patch before an interview.
- **Cheapest that is always reachable.** The page and API never sleep; only the database naps, and a demo
  with sample data fits in Neon Free's 1 GB and 100 CU-hours.
- **Same rules as development.** The owner and `erp_app` roles are created with SQL as locally, so the demo
  shows RLS the way it really runs (step 2 checks it).
- **Easy to grow.** Neon Launch is usage-based with no minimum [2]; Render Standard is a plan change.
- Fallback: option F if we want one fixed bill and full control, accepting the extra upkeep.

Pick the **Singapore** region for both, the closest to Bangladesh, if it is offered when you create them.

## Steps (a person runs these; nothing is deployed yet)

1. **Neon:** create a project (PostgreSQL 16, Singapore). Note the **owner** connection string. Use the
   **direct** (not pooled) connection for everything below: the API holds one connection per request
   transaction (ADR 0005), and migrations need a direct one.
2. **Create `erp_app` with the role-setup script** (the same one Docker and CI use). On your machine, with
   psql installed, set these in your shell only (never in a file in the repo), then run:

   ```sh
   export PGHOST=<neon host> PGPORT=5432 PGSSLMODE=require PGPASSWORD=<owner password>
   export POSTGRES_USER=<owner role> POSTGRES_DB=<database>
   export APP_DB_USER=erp_app APP_DB_PASSWORD=<a new long random password>
   sh docker/postgres/init/01-app-role.sh
   ```

   Create `erp_app` only this way, not in Neon's console, which may give its roles extra privileges. Then
   check, as the owner: `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'erp_app';` must give `f | f`.

3. **Migrations, as the owner:** `MIGRATION_DATABASE_URL=<owner direct URL> npm run db:migrate:deploy`.
4. **Sample data:** none to load yet. The seed script is task F4; until then the screens use their mock
   services. Never load real customer data (CLAUDE.md).
5. **Render:** New, Web Service, connect the GitHub repo, branch `main`, runtime **Docker**, plan **Starter**,
   region Singapore. Health check path: `/health`.
6. **Environment variables on Render** (names only here; values go only into Render's dashboard):
   - `DATABASE_URL`: the **`erp_app`** direct URL with `sslmode=require`. Never the owner URL.
   - `API_PORT`: the port Render routes to (Render's `PORT`, `10000` by default).
   - `DB_POOL_MAX`: `5` (a small demo needs few connections).
   - `DB_TX_TIMEOUT_MS`: `10000`.
   - `APP_VERSION`: the git tag or commit you deploy.
   - `LOG_LEVEL`: `info`.
   - `NODE_ENV` and `STATIC_DIR` are already set in the image.
7. **Deploy**, then smoke-test:
   - `GET /health` gives `200` and `"database":"ok"`.
   - `/` shows the app; a reload on a page route still shows it.
   - `GET /api/v1/anything` gives a JSON `404` in the standard error shape.
8. **Later, not now:** deploy from a CI job on a version tag (roadmap 8), with the migration step and the
   role-setup script run by the pipeline, never by hand (answer on #5).

## Checked locally (17 Nov 2026)

`docker build -t erp-demo:local .`, then the image run against the development Postgres:
`/health` 200 with the database ok, `/api/health` 200, `/` and `/customers/1` serve the app, the built assets
load, `/api/v1/x` is a JSON 404, the process runs as `node`, no `.env` is in the image, and the Docker
healthcheck reports healthy. Image size: about 476 MB.

## Sources

1. Render: [Pricing](https://render.com/pricing), [Postgres instance types](https://render.com/docs/postgresql-legacy-instance-types), [small-business hosting costs](https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses)
2. Neon: [Pricing](https://neon.com/pricing), [Plans](https://neon.com/docs/introduction/plans)
3. Railway: [Pricing plans](https://docs.railway.com/pricing/plans), [Pricing](https://railway.com/pricing)
4. Third-party: [Railway pricing 2026 (Nayan Kyada)](https://nayankyada.com/blog/railway-pricing-2026-free-tier-limits-usage-costs-when-to-upgrade)
5. Fly.io: [Resource pricing](https://docs.fly.io/about/pricing), [Managed Postgres](https://fly.io/docs/mpg/)
6. Koyeb: [Instances](https://www.koyeb.com/docs/reference/instances), [Databases](https://www.koyeb.com/docs/databases)
7. Third-party: [Koyeb free tier 2026 (srvrlss.io)](https://www.srvrlss.io/provider/koyeb/)
8. Hetzner: [Cost-optimized cloud](https://www.hetzner.com/cloud/cost-optimized/), [IPv4 pricing](https://docs.hetzner.com/general/infrastructure-and-availability/ipv4-pricing/)
9. Third-party: [Hetzner pricing after the 2026 adjustments (AgentDeals)](https://agentdeals.dev/hetzner-pricing-2026), [Hetzner CX22/CX23 pricing (vpsfor.dev)](https://vpsfor.dev/posts/hetzner-cx22-pricing-2026/)

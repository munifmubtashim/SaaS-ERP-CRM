# Demo deployment plan

A public demo for the interview slice (due 29 Nov 2026): the API and the built frontend in one container, and
one PostgreSQL database. **Sample data only. Nothing is deployed yet.** A person runs every step below; no
Claude session touches the hosted services or their secrets (CLAUDE.md, "Never do").

## What runs

- **One container** from the repo's `Dockerfile`. It builds the frontend, bundles the API, and serves both from
  one origin: pages at `/`, the API at `/api/...` (the same path the Vite proxy uses in development), and two
  health paths: `/health/live` (liveness, never touches the database; for Render) and `/health` (also runs
  `SELECT 1`; for CI and manual checks). `STATIC_DIR=/app/public` turns on the frontend serving; it is set in
  the image.
- **One PostgreSQL 16 database** with two roles, as in development: the **owner** runs migrations, and
  **`erp_app`** (NOSUPERUSER, NOBYPASSRLS, owns nothing) is the only role the API connects as.
- No Redis, MinIO, Mailpit or worker: the slice does not use them yet.

## Options and costs

Prices checked on **17 Nov 2026**, in USD unless shown, before tax. "Third-party" means the figure comes from a
price-tracking article, not the provider's own page; check it on the provider's page before paying.

| Option                                           | App                                                         | Database                                                                           | About per month                                                                                                      |
| ------------------------------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **A. Render web service + Neon Postgres (Free)** | Render Starter, $7, always on [1]                           | Neon Free, $0: 100 CU-hours a month and 1 GB, scales to zero when idle [2]         | **$7**                                                                                                               |
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

### Neon Free compute, and why Render checks `/health/live`

Checked on **17 Nov 2026** on Neon's plans page (last updated 12 Nov 2026) [2]:

- **100 CU-hours per project per month**, "enough to run a 0.25 CU compute in a project for 400 hours/month".
  CU-hours = compute size × hours the compute is running.
- **Scale to zero is always on**: the compute suspends after **5 minutes** of inactivity and cannot be kept
  awake by a setting. A suspended compute uses no CU-hours.
- **When the CU-hours run out**, "your compute is suspended until the next billing period or until you
  upgrade": every connection fails until then.

Render sends a health check to each instance "every few seconds" [10]. If that check ran `SELECT 1`, the
database would never have 5 idle minutes: about 730 hours a month at 0.25 CU is **about 182 CU-hours**, so the
100 would run out in about **17 days** and the database would be down for the rest of the month. So Render's
health check uses **`/health/live`**, which answers from the API process alone. The database then runs only
while someone uses the demo: up to 400 hours a month at 0.25 CU, far more than interviews need. If we ever
need the database awake all month, budget for Neon Launch ($0.106 per CU-hour [2]; about $19 for 182
CU-hours).

- F is the cheapest always-on option, but we would run TLS, backups, OS updates and the firewall ourselves.

## Recommendation: option A (Render Starter + Neon Free), about $7 a month

- **Least to run.** Render builds the `Dockerfile` from GitHub, gives HTTPS, restarts on failure and checks
  `/health/live`. Neon runs the database. No server to patch before an interview.
- **Cheapest that is always reachable.** The page and API never sleep; only the database naps, and a demo
  with sample data fits in Neon Free's 1 GB and 100 CU-hours, as long as nothing polls the database (see
  above).
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
   region Singapore. Health check path: **`/health/live`** (never `/health`; see "Neon Free compute" above).
   In Settings, set **Auto-Deploy to Off** [11]. The default, "On Commit", would deploy every merge to `main`,
   including one whose migration has not run yet (#19 is the first such merge).
6. **Environment variables on Render** (names only here; values go only into Render's dashboard):
   - `DATABASE_URL`: the **`erp_app`** direct URL with `sslmode=require`. Never the owner URL.
   - `API_PORT`: the port Render routes to (Render's `PORT`, `10000` by default).
   - `DB_POOL_MAX`: `5` (a small demo needs few connections).
   - `DB_TX_TIMEOUT_MS`: `10000`.
   - `APP_VERSION`: the git tag or commit you deploy.
   - `LOG_LEVEL`: `info`.
   - `NODE_ENV` and `STATIC_DIR` are already set in the image.
7. **Deploy** by hand (Manual Deploy in Render), then smoke-test:
   - `GET /health/live` gives `200`; `GET /health` gives `200` and `"database":"ok"`.
   - `/` shows the app; a reload on a page route still shows it.
   - `GET /api/v1/anything` and `GET /api/customers` give a JSON `404` in the standard error shape.
   - `/` has `Cache-Control: no-cache`; files under `/assets/` have `public, max-age=31536000, immutable`.

## Every later deploy: migrate, then deploy

Auto-deploy is off, so each release is two steps, always in this order:

1. **Migrate** as the owner, from your machine, on the commit you are about to deploy:

   ```sh
   MIGRATION_DATABASE_URL=<owner direct URL> npm run db:migrate:deploy
   ```

   Migrations are expand-only (roadmap 9.3), so the old code keeps working on the new schema in between.

2. **Deploy** that commit with Render's Manual Deploy, then run the smoke test above.

**Render's pre-deploy command** could run step 1 for us. Render's docs: "The pre-deploy command is available
for paid web services, private services, and background workers" [11], so Starter has it; if it fails, the
deploy fails and the previous version keeps running [11]. We don't use it yet, for two reasons:

- It runs with the service's environment, so the **owner** database URL would have to live in the web
  service's settings next to the app, which only ever connects as `erp_app` (CLAUDE.md, tenancy rules).
- It runs in our runtime image, which no longer contains the Prisma CLI (the production install leaves it
  out, see the `Dockerfile`), so `prisma migrate deploy` is not there to run.

Revisit when deploys move to CI (step 8): CI holds the owner URL as a secret and can run the migration
before it triggers the deploy. 8. **Later, not now:** deploy from a CI job on a version tag (roadmap 8), with the migration step and the
role-setup script run by the pipeline, never by hand (answer on #5).

## Checked locally (17 Nov 2026)

`docker build -t erp-demo:local .`, then the image run against the development Postgres:
`/health` 200 with the database ok, `/api/health` 200, `/` and `/customers/1` serve the app, the built assets
load, `/api/v1/x` is a JSON 404, the process runs as `node`, no `.env` is in the image, and the Docker
healthcheck reports healthy. Image size: about 476 MB.

After Farhan's review on #17, the image (Node 22.23.5, `--omit=optional`) was run with a database URL that
points nowhere: `/health/live` and `/api/health/live` 200, `/health` 503 (no database, as expected), `/api`
and `/api/customers` JSON 404s, `/` and a page reload `no-cache`, a hashed asset `immutable`, user `node`, no
`.env`, and the Docker healthcheck healthy without a database. Image size: 486 MB.

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
10. Render: [Health checks](https://render.com/docs/health-checks) (checked 17 Nov 2026)
11. Render: [Deploying on Render](https://render.com/docs/deploys): pre-deploy command, Auto-Deploy options (checked 17 Nov 2026)

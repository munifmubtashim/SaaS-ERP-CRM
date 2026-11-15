# SaaS-ERP-CRM

Multi-business ERP and CRM for Bangladeshi businesses: a generic core (parties, products, stock, sales,
purchasing, accounting) plus industry packs. First customer: a motorcycle dealership (vehicle pack).

- **Rules for humans and Claude Code:** [CLAUDE.md](CLAUDE.md). Read it before your first change.
- **Source of truth:** [docs/reference/](docs/reference/): Roadmap Draft v2 and Acceptance Specification v2 (the spec wins).
- **Decisions:** [docs/adr/](docs/adr/). **Approved UI design:** [design/](design/).

## What you need

| Tool                   | Version                             | Check                    |
| ---------------------- | ----------------------------------- | ------------------------ |
| Node.js                | 22.18 or newer (CI uses 22 LTS)     | `node -v`                |
| npm                    | 10 or newer (comes with Node)       | `npm -v`                 |
| Docker with Compose v2 | Docker Desktop, OrbStack, or Colima | `docker compose version` |
| Git                    | any recent                          | `git --version`          |

On macOS without Docker Desktop: `brew install colima docker docker-compose && colima start`, then link the
compose plugin once: `mkdir -p ~/.docker/cli-plugins && ln -sf "$(brew --prefix)/opt/docker-compose/bin/docker-compose" ~/.docker/cli-plugins/docker-compose`.

## Developer setup (Claude Code tools, once per machine)

Each developer runs this on their own machine. It writes to your **user** Claude Code config
(`~/.claude.json`, plus a rule in `~/.claude/rules/` and a skill in `~/.claude/skills/`), not to this repo,
and no key or token is involved: you sign in through the browser.

1. **Context7** (current library docs for Claude; needs Node 22.13 or newer):
   `npx ctx7@latest setup --claude --mcp --oauth --yes`
2. Restart Claude Code, run `/mcp`, choose **context7** and **Authenticate**, and finish the sign-in in your browser.
3. Check it: ask Claude to look up the Prisma multi-file schema setup with Context7; it should quote the Prisma docs.

No other plugin, skill or MCP server is part of the shared setup.

## Clone to running

```bash
git clone https://github.com/munifmubtashim/SaaS-ERP-CRM.git
cd SaaS-ERP-CRM
git switch dev-<your-name>          # dev-munif or dev-farhan; never work on main

npm ci                              # installs every workspace from package-lock.json
cp .env.example .env                # local-only placeholders; never commit .env

npm run docker:up                   # Postgres 16 (host port 5433), Redis, MinIO, Mailpit; waits until healthy
npm run db:migrate:deploy           # applies migrations (Phase 0: one empty baseline)

npm run check                       # lint + typecheck + unit tests
npm run test:integration            # dal and api against the real Postgres
npm run build                       # builds api and frontend

npm run dev                         # api on :3000, frontend on :5173
```

Open http://localhost:5173. The **System status** card shows _API: Working_ and _Database: Working_.
That is the full path working: browser → Vite proxy → api → businessLogic → dal → PostgreSQL.
The API alone: `curl http://127.0.0.1:3000/health`.

Local services: Mailpit inbox http://localhost:8025 · MinIO console http://localhost:9001 (user and password in `.env`).

## Layout

```
packages/backend/src/api            HTTP layer: routes, controllers, middleware (Express)
packages/backend/src/businessLogic  business rules: <Module>Manager (no Express, no SQL)
packages/backend/src/dal            database access: Prisma schema per module, migrations, raw SQL, DTOs, <Module>Query
packages/frontend                   React app: app shell, design system, features/<module>, services, i18n (en, bn)
packages/shared                     types, Zod schemas, money/date/permission helpers used by backend and frontend
```

Dependencies go one way: api → businessLogic → dal. `npm run lint` fails on a wrong import. Copy the
**Health** slice when adding behaviour; every roadmap module already has a stub in every layer. Full tree,
naming pattern and rules: [CLAUDE.md](CLAUDE.md) and [ADR 0003](docs/adr/0003-repository-layout.md).

## Everyday commands

| Command                    | What it does                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------- |
| `npm run dev`              | api (watch) + frontend (Vite)                                                          |
| `npm run check`            | lint, typecheck and unit tests: run before every push                                  |
| `npm run test:integration` | tests against real Postgres (needs `npm run docker:up`)                                |
| `npm run test:isolation`   | tenant-isolation suite (every tenant route needs a case)                               |
| `npm run db:migrate:dev`   | create and apply a migration from schema changes (use `/add-migration` in Claude Code) |
| `npm run format`           | Prettier                                                                               |
| `npm run docker:down`      | stop local services (data is kept)                                                     |

## Working together

- Branches: `main` (protected), `dev-munif`, `dev-farhan`, optional short `feat/*` off your dev branch.
- Every morning: `git fetch origin && git merge origin/main` into your dev branch. Never rebase or force-push it.
- One task, one PR to `main`, every 2 to 3 days. The other developer reviews and approves; CI must be green.
- Conventional Commits with a module scope: `feat(sales): allow partial payment on invoice`.

## Troubleshooting

- **Port 5433, 6379, 9000 or 8025 in use:** change the port in `.env` (and the matching URL), then `npm run docker:up`.
- **`Invalid environment` on `npm run dev`:** `.env` is missing or incomplete; compare it with `.env.example`.
- **Colima: `erp_app` password authentication fails on a new database.** Colima only shares your home folder with
  its VM, so a clone outside `~` mounts an empty `docker/postgres/init`. Keep the repo under your home folder, then
  `docker compose down -v && npm run docker:up`.
- **Prisma client errors after pulling:** `npm run db:generate`.
- **Start the database from scratch:** `docker compose down -v` (deletes local data), then `npm run docker:up` and `npm run db:migrate:deploy`.

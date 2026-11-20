# Demo deployment: plan and production image

## What was built

- `docs/deploy/demo.md`: hosting options with prices checked on 17 Nov 2026, the recommendation (Render
  Starter + Neon Free, about $7 a month) and the steps a person runs. Nothing is deployed.
- `Dockerfile` and `.dockerignore`: one image with the API and the built frontend, on Node 22.23.5 pinned by
  digest, running as `node`, with a healthcheck on `/health/live` and no secrets inside.
- `app.ts`: when `STATIC_DIR` is set, the API also serves the built frontend from the same origin, with
  `immutable` caching for hashed assets and `no-cache` for `index.html`.
- `GET /health/live`: liveness that never touches the database, for Render's health check. `/health` (with
  `SELECT 1`) stays for CI and manual checks.
- `tsup.config.ts`: a fix. The bundled API crashed on start (`Dynamic require of "events"`), because `pg`,
  a CommonJS dependency of the dal package, was bundled into the ESM output. Now every workspace's npm
  dependencies stay external.

## Request flow in the container

1. `GET /`: no route matches, so `express.static` sends `index.html` from `STATIC_DIR`.
2. The app calls `/api/health`: a first middleware strips `/api`, exactly as the Vite proxy does in
   development, and the Health route answers.
3. A reload on `/customers/42`: no route or file matches, the request wants HTML, so `index.html` is sent and
   React Router shows the page.
4. `/api/v1/unknown` or `/api/customers`: the path the client sent started with `/api`, so it is API. It never
   gets a file or `index.html`; the normal JSON 404 answers.
5. Render calls `/health/live` every few seconds. It answers from the process alone, so Neon's database can
   still scale to zero after 5 idle minutes.

## Why each part exists

- **One origin:** no CORS, and the `X-Business-Id` header (ADR 0007) needs no extra setup.
- **Two-stage image:** build tools stay in the first stage; the runtime has only the API's production
  dependencies. `--omit=optional` keeps Prisma's CLI out: it is an optional peer of `@prisma/client` and one
  of our devDependencies, so `--omit=dev` alone keeps it (803 MB down to 486 MB).
- **Migrations outside the image:** they run as the owner; the app only ever has the `erp_app` login.
- **Auto-deploy off; migrate, then deploy:** a merge that adds a migration must never reach Render before its
  migration has run.

## Five questions an interviewer could ask

1. Why does the API serve the frontend instead of a separate static host?
2. How do you stop a page-route fallback from hiding a real API 404?
3. Why was the bundled server crashing, and why did CI not catch it?
4. Why is the database URL in the container never the owner's?
5. Why would a health check that queries the database cost money on a scale-to-zero database?

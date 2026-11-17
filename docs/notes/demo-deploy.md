# Demo deployment: plan and production image

## What was built

- `docs/deploy/demo.md`: hosting options with prices checked on 17 Nov 2026, the recommendation (Render
  Starter + Neon Free, about $7 a month) and the steps a person runs. Nothing is deployed.
- `Dockerfile` and `.dockerignore`: one image with the API and the built frontend, running as `node`, with a
  healthcheck on `/health` and no secrets inside.
- `app.ts`: when `STATIC_DIR` is set, the API also serves the built frontend from the same origin.
- `tsup.config.ts`: a fix. The bundled API crashed on start (`Dynamic require of "events"`), because `pg`,
  a CommonJS dependency of the dal package, was bundled into the ESM output. Now every workspace's npm
  dependencies stay external.

## Request flow in the container

1. `GET /`: no route matches, so `express.static` sends `index.html` from `STATIC_DIR`.
2. The app calls `/api/health`: a first middleware strips `/api`, exactly as the Vite proxy does in
   development, and the Health route answers.
3. A reload on `/customers/42`: no route or file matches, the request wants HTML, so `index.html` is sent and
   React Router shows the page.
4. `/api/v1/unknown`: it is an API path, so it never gets `index.html`; the normal JSON 404 answers.

## Why each part exists

- **One origin:** no CORS, and the `X-Business-Id` header (ADR 0007) needs no extra setup.
- **Two-stage image:** build tools stay in the first stage; the runtime has only the API's production
  dependencies (`--legacy-peer-deps` keeps Prisma's CLI, a peer dependency, out: 803 MB down to 476 MB).
- **Migrations outside the image:** they run as the owner; the app only ever has the `erp_app` login.

## Five questions an interviewer could ask

1. Why does the API serve the frontend instead of a separate static host?
2. How do you stop a page-route fallback from hiding a real API 404?
3. Why was the bundled server crashing, and why did CI not catch it?
4. Why is the database URL in the container never the owner's?
5. What would you change to deploy from CI instead of the dashboard?

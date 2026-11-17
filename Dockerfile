# syntax=docker/dockerfile:1
# Production image for the demo: the API and the built frontend, served from one origin (STATIC_DIR).
# No secrets are baked in: DATABASE_URL and the rest come from the host's environment at run time.
# Migrations are not run here; they run as the owner role, separately (docs/deploy/demo.md).

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY . .
RUN npm ci
RUN npm run db:generate \
 && npm run build -w @erp/api \
 && npm run build -w @erp/frontend

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    API_PORT=3000 \
    STATIC_DIR=/app/public
WORKDIR /app
# Install only the API's production dependencies. npm needs every workspace manifest to read the lockfile.
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/packages/frontend/package.json packages/frontend/
COPY --from=build /app/packages/backend/src/api/package.json packages/backend/src/api/
COPY --from=build /app/packages/backend/src/businessLogic/package.json packages/backend/src/businessLogic/
COPY --from=build /app/packages/backend/src/dal/package.json packages/backend/src/dal/
RUN npm ci --omit=dev --legacy-peer-deps --ignore-scripts --workspace @erp/api && npm cache clean --force
COPY --from=build /app/packages/backend/src/api/dist packages/backend/src/api/dist
COPY --from=build /app/packages/frontend/dist public

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.API_PORT + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "packages/backend/src/api/dist/server.js"]

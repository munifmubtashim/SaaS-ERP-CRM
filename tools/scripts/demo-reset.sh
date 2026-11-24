#!/bin/sh
# demo:reset (demo-local4, local only; Munif 24 Nov): rebuild the LOCAL Docker Postgres from scratch, apply every
# migration, and run the demo seed. It only touches this repo's docker compose project ("erp") on this machine:
# the postgres container and its volume erp_postgres-data. The seed has its own guard (local hosts only).
set -eu
if [ "${NODE_ENV:-}" = "production" ]; then
  echo "demo:reset refuses to run with NODE_ENV=production." >&2
  exit 1
fi
cd "$(dirname "$0")/../.."
echo "Rebuilding the local database (container postgres, volume erp_postgres-data)..."
docker compose rm -sf postgres >/dev/null
docker volume rm -f erp_postgres-data >/dev/null
docker compose up -d --wait
npm run db:migrate:deploy
npm run db:seed
echo "Demo database ready."

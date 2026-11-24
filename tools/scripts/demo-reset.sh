#!/bin/sh
# demo:reset (demo-local4, local only; Munif 24 Nov): build a SEPARATE throwaway demo database, apply every migration
# and run the demo seed (fictional data only, docs/demo-seed-spec.md). It never touches the everyday local database
# (compose project "erp", erp_postgres-data): the guard below refuses any target but demo4 (container erp-pg-demo4,
# port 55444, volume erp_demo4-data, database erp_demo4). Passwords are generated afresh on every reset and written
# only to .demo/demo4.conf (mode 600, in .git/info/exclude). The seed (demo-seed.sh) reads the owner's two variables
# from .demo/owner.conf only, which nothing here ever writes or prints.
set -eu
if [ "${NODE_ENV:-}" = "production" ]; then
  echo "demo:reset refuses to run with NODE_ENV=production." >&2
  exit 1
fi
cd "$(dirname "$0")/../.."
CONTAINER="${DEMO_DB_CONTAINER:-erp-pg-demo4}"
PORT="${DEMO_DB_PORT:-55444}"
VOLUME="${DEMO_DB_VOLUME:-erp_demo4-data}"
DB="${DEMO_DB_NAME:-erp_demo4}"
node tools/scripts/demoGuard.ts "$CONTAINER" "$PORT" "$VOLUME" "$DB"
node tools/scripts/demoOwnerCheck.ts .demo/owner.conf

secret() { node -e "process.stdout.write(require('node:crypto').randomBytes(18).toString('base64url'))"; }
OWNER_PW="$(secret)"; APP_PW="$(secret)"; PROV_PW="$(secret)"

echo "Rebuilding the demo database ($CONTAINER, port $PORT, volume $VOLUME, database $DB)..."
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker volume rm -f "$VOLUME" >/dev/null
docker run -d --name "$CONTAINER" -p "127.0.0.1:$PORT:5432" -v "$VOLUME:/var/lib/postgresql/data" \
  -e POSTGRES_USER=erp_owner -e POSTGRES_PASSWORD="$OWNER_PW" -e POSTGRES_DB="$DB" \
  -e APP_DB_USER=erp_app -e APP_DB_PASSWORD="$APP_PW" \
  -e PROVISIONER_DB_USER=erp_provisioner -e PROVISIONER_DB_PASSWORD="$PROV_PW" \
  -v "$PWD/docker/postgres/init:/docker-entrypoint-initdb.d:ro" postgres:16.16-alpine >/dev/null
i=0
until [ "$(docker logs "$CONTAINER" 2>&1 | grep -c 'ready to accept')" -ge 2 ]; do
  i=$((i + 1)); [ "$i" -gt 60 ] && { echo "The demo database did not start." >&2; exit 1; }; sleep 1
done

mkdir -p .demo
umask 077
cat > .demo/demo4.conf <<CONF
DATABASE_URL=postgresql://erp_app:$APP_PW@127.0.0.1:$PORT/$DB
MIGRATION_DATABASE_URL=postgresql://erp_owner:$OWNER_PW@127.0.0.1:$PORT/$DB
PROVISIONING_DATABASE_URL=postgresql://erp_provisioner:$PROV_PW@127.0.0.1:$PORT/$DB
CONF
chmod 600 .demo/demo4.conf
set -a; . ./.demo/demo4.conf; set +a
npm run db:migrate:deploy
sh tools/scripts/demo-seed.sh
echo "Demo database ready ($CONTAINER). Start everything with: npm run demo:start"

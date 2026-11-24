#!/bin/sh
# demo:start (demo-local4, local only): rebuild the demo database (demo:reset, guarded), then run the api and the
# frontend against it. Its URLs come from .demo/demo4.conf and take precedence over the root settings file's (Node's
# --env-file never overrides a variable already set). Stop the api to see every screen fall back to marked sample data.
set -eu
cd "$(dirname "$0")/../.."
sh tools/scripts/demo-reset.sh
set -a; . ./.demo/demo4.conf; set +a
node tools/scripts/demoGuardUrl.ts DATABASE_URL MIGRATION_DATABASE_URL PROVISIONING_DATABASE_URL
# Its own ports, so it runs beside anything already on 3000 or 5173; the proxy and the CSRF origin follow them.
API_PORT="${DEMO_API_PORT:-3004}"
WEB_PORT="${DEMO_WEB_PORT:-5174}"
API_PROXY_TARGET="http://127.0.0.1:$API_PORT"
APP_ORIGIN="http://localhost:$WEB_PORT"
export API_PORT WEB_PORT API_PROXY_TARGET APP_ORIGIN
echo "Demo: web http://localhost:$WEB_PORT, api http://127.0.0.1:$API_PORT"
exec npm run dev

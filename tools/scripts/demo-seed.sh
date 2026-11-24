#!/bin/sh
# demo:seed (demo-local4, local only; Munif 25 Nov): run the demo seed against the demo4 database only. The owner's two
# variables come from .demo/owner.conf alone (never the root settings file), the database URLs from .demo/demo4.conf,
# and both URLs are checked to be erp_demo4 on 127.0.0.1:55444 before the seed starts. Nothing here prints a value.
set -eu
cd "$(dirname "$0")/../.."
[ -f .demo/demo4.conf ] || { echo "No demo database settings: run npm run demo:reset first." >&2; exit 1; }
node tools/scripts/demoOwnerCheck.ts .demo/owner.conf
unset DEMO_OWNER_EMAIL DEMO_OWNER_PASSWORD
set -a; . ./.demo/demo4.conf; . ./.demo/owner.conf; set +a
node tools/scripts/demoGuardUrl.ts MIGRATION_DATABASE_URL DATABASE_URL PROVISIONING_DATABASE_URL
cd packages/backend/src/businessLogic
exec npx tsx scripts/seedDemo.ts

#!/bin/sh
# demo:start (demo-local4, local only): rebuild the demo database (demo:reset, guarded), then run the api and the
# frontend against it. Its URLs come from .demo/demo4.conf and take precedence over the root settings file's (Node's
# --env-file never overrides a variable already set). Stop the api to see every screen fall back to marked sample data.
set -eu
cd "$(dirname "$0")/../.."
sh tools/scripts/demo-reset.sh
set -a; . ./.demo/demo4.conf; set +a
exec npm run dev

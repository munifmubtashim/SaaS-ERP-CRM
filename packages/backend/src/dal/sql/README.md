# dal/sql

Raw SQL that Prisma does not model (roadmap 4.1): row-level security policies, immutability and
balanced-journal triggers, group views (`WITH (security_invoker = true)`), report queries.

These files are the readable source. Every statement reaches the database through a migration in
`../prisma/migrations/` (copy the SQL into the migration that needs it), so CI applies exactly what
production gets. Suggested layout: `rls/`, `triggers/`, `views/`, `reports/`, one file per object.

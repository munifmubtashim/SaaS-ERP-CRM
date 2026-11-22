# dal/prisma/seeds

Seed scripts for local, CI and demo databases. Synthetic data only: never real customers, never the
old system's exports (those stay in `data/real/`, outside git).

- `systemRoles.ts` (ADR 0009 part 4): the permission list once, and an organization's five system roles with the
  default mapping from `shared/src/utils/permissions.ts`. Idempotent; runs as the migration owner through the
  owner's forced-RLS policies, with `app.organization_id` set by `set_config(..., true)`. Never as `erp_app`.
- Only the seed files and `AuthQuery` may name the auth tables (ADR 0008 test 15 lists them).

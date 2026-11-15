# 0002: Phase 0 tooling choices

| Field    | Value                                         |
| -------- | --------------------------------------------- |
| Status   | Proposed (review in Farhan's first PR review) |
| Date     | 2026-11-14                                    |
| Deciders | Munif, Farhan                                 |
| Refs     | roadmap 4.1, 8.4, 8.5, 9.2, 10.2              |

## Context

The roadmap names the stack. Setting it up surfaced choices it does not settle. These are recorded so either of
us can revisit them with the reason in front of us.

## Decision

1. **TypeScript 6.0.3, not 7.x.** typescript-eslint 8.72 supports TypeScript below 6.1 only. Move to 7 when
   typescript-eslint supports it.
2. **Prisma 7.10.1, pinned.** npm's `latest` tag pointed at a pre-release (8.0.0-rc) on 14 Nov 2026. Prisma 7
   needs `prisma.config.ts` (it no longer reads `.env` itself) and the `@prisma/adapter-pg` driver adapter.
3. **Multi-file Prisma schema** (`packages/backend/src/dal/prisma/schema/`, one file per module), owned per CODEOWNERS
   (roadmap 2.2). Supported and verified: generate, migrate and drift check all work with the folder.
4. **Two database roles from day one.** Migrations run as the owner (`MIGRATION_DATABASE_URL`); the API and
   worker run as `erp_app`, created NOSUPERUSER NOBYPASSRLS (roadmap 4.2 rule 3). An integration test asserts it.
5. **MinIO image: `cgr.dev/chainguard/minio`, pinned by digest.** `minio/minio` no longer exists on Docker Hub,
   and the Quay copy requires login. Chainguard's free image only has a `latest` tag, so the digest pins it.
   Local development only; production storage is decided at the deployment phase.
6. **Postgres on host port 5433** in docker compose, so it does not collide with a locally installed Postgres.
7. **Module routers with a scope + isolation coverage test.** Every `<Module>Routes.ts` returns
   `{ basePath, scope: 'public' | 'tenant', router }`; a test walks every router and fails CI when a tenant
   route has no isolation case or a public route is not on the allowlist. That makes the "new route without an
   isolation test fails CI" rule (roadmap 10.1) true from Phase 0, before any tenant route exists.
8. **`npm audit --audit-level=high` in CI.** On 14 Nov 2026 there are 7 moderate advisories, all from one
   dev-only `minimatch` advisory (GHSA-g3hv-75wg-m249) inside typescript-eslint. Production dependencies: 0.
   Re-check when typescript-eslint updates.
9. **Branch protection without "require code owner review".** With one owner per module, a module owner's own
   PR could never get a code-owner approval. "1 approving review" already forces the other developer to approve.
10. **Secret scan with the gitleaks binary (v8.30.1) over full history**, not the gitleaks GitHub Action, to avoid
    the Action's licence terms.
11. **Slash commands are skills** (`.claude/skills/<name>/SKILL.md`), the current Claude Code format;
    `.claude/commands/` still works but is the older format.

## Consequences

Upgrades of TypeScript, Prisma and the MinIO image are deliberate chore PRs. The required CI checks are the job
names in `.github/workflows/ci.yml`; renaming a job means updating branch protection.

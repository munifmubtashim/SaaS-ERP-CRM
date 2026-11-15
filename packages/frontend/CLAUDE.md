# packages/frontend

Read the root CLAUDE.md and `.claude/skills/erp-ui-design` before building any screen. Imports `@erp/shared` only.

- `features/<module>/` per module; `app/AppShell/` and `components/ui/` are shared (both developers review).
- Server state through TanStack Query; API calls only in `services/<module>Service.ts`, validated with shared Zod schemas.
- Forms with React Hook Form + the shared Zod schema. Money stays a string end to end.
- Every string from `i18n/` (en and bn); every colour from tokens via Tailwind classes (`bg-accent`, `text-muted`), never raw hex.
- Every data view has loading, empty, error and no-permission states. Check English and Bangla, phone and desktop.

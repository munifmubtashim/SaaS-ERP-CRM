# Conventions

The shared, enforced conventions live in the repo-root **`CLAUDE.md`** (both developers, every Claude session):
stack, commands, repository tree, layer rules (api → businessLogic → dal), naming pattern
(`<Module>Routes/Controller/Manager/Query/DTO`, `<module>.types.ts`, `<module>.schema.ts`), money and stock
invariants, tenancy rules, Git rules and the never-do list. Reviewer agents check code against that file.

Decisions: `docs/adr/` (shared home for ADRs; this vault indexes them in `decisions.md`).

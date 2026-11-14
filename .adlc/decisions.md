# Decisions Index

Catalog of all ADRs (architecture decision records). Updated by `/wrapup` when an ADR is accepted, superseded, or rejected.

| ID | Title | Status | Decided | Supersedes | Superseded by |
|---|---|---|---|---|---|
| 0001 | Spec vs roadmap conflicts (docs/adr/0001) | proposed | — | | |
| 0002 | Phase 0 tooling choices (docs/adr/0002) | proposed | — | | |
| 0003 | Repository layout replaces roadmap 8.5 (docs/adr/0003) | accepted | 2026-11-14 | | |

## Status legend

- **proposed** — drafted, not yet decided
- **accepted** — decision in effect
- **superseded** — replaced by a later ADR (link in "Superseded by")
- **rejected** — considered and not pursued

## How to add an entry

1. Create the ADR file at `architecture/adr-<NN>-<slug>.md` from `templates/adr-template.md`.
2. Add the `^ADR-<NN>` block anchor at the title.
3. Add a row here.
4. Link from `index.md` ADRs section.

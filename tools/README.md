# tools

Scripts that are not part of the running app (roadmap 8.5): the importer for the old system's exports,
the anonymiser, and seed generators. Empty in Phase 0.

Rule: real exports stay in `data/real/` (gitignored, blocked for Claude sessions). Only anonymised output may
leave that folder, and only after the anonymiser has run. Nothing real enters git, CI, screenshots or the demo.

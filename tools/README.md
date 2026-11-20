# tools

Scripts that are not part of the running app (roadmap 8.5): the importer for the old system's exports,
the anonymiser, and seed generators. Empty in Phase 0.

Rule: real exports stay in `data/real/` (gitignored, blocked for Claude sessions). Only anonymised output may
leave that folder, and only after the anonymiser has run. Nothing real enters git, CI, screenshots or the demo.

`src/demo/`: invented data for the 29 Nov demo seed (products, customers, branches, opening stock) and a
deterministic generator of invoice requests. Plain data only; the seed script that writes it comes later.

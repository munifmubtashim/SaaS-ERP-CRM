# packages/shared

Read the root CLAUDE.md first. Imports nothing from the other packages (only `zod`). Both developers review changes.

- `schemas/<module>.schema.ts`: Zod schemas for API payloads; `types/<module>.types.ts`: types inferred from them.
- `utils/`: money (strings, numeric(18,2), lakh/crore formatting), dates (UTC stored, Asia/Dhaka shown), permission codes, `AppError`.

/**
 * Permission codes, "<module>.<entity>.<action>" (roadmap 5.1), seeded into the permission table.
 * TODO(Munif, Phase 1): fill from the agreed role matrix (ADR 0001 row 8 decides the role names).
 */
export const PERMISSIONS = [] as const satisfies readonly `${string}.${string}.${string}`[];
export type PermissionCode = (typeof PERMISSIONS)[number];

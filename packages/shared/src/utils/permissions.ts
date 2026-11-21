import { z } from 'zod';

/**
 * Permission codes and roles (ADR 0008 section 3). Defined once here; the A4 seed reads this file, so code and
 * database cannot drift. Shared code: both developers review changes.
 *
 * Codes are `<module>.<entity>.<action>` (roadmap 5.1). Each module adds its own codes, and their default role
 * mapping, in its own PR, as its ADR decides (Party: ADR 0006).
 */
export const PERMISSIONS = [
  // Hidden fields (ADR 0008 section 3; hiding them in responses is plan 2.5).
  'product.cost.view',
  'report.profit.view',
  'accounting.salary.view',
] as const satisfies readonly `${string}.${string}.${string}`[];

export const permissionCodeSchema = z.enum(PERMISSIONS);
export type PermissionCode = z.infer<typeof permissionCodeSchema>;

/** The five system roles seeded per organization (spec C-01, D-03; ADR 0001 row C7). */
export const ROLE_CODES = ['owner', 'business_manager', 'branch_manager', 'accountant', 'cashier'] as const;

export const roleCodeSchema = z.enum(ROLE_CODES);
export type RoleCode = z.infer<typeof roleCodeSchema>;

/** Stored in `role.name`. English in the database; the UI shows each role by code through i18n. */
export const ROLE_NAMES = {
  owner: 'Owner',
  business_manager: 'Business Manager',
  branch_manager: 'Branch Manager',
  accountant: 'Accountant',
  cashier: 'Cashier',
} as const satisfies Record<RoleCode, string>;

/**
 * Default role mapping, **provisional** until ADR 0001 row C7 is accepted and the owner confirms who may see
 * cost, profit and salary; configurable per business later. Owner is mapped explicitly to every code (no
 * wildcard), so each module's PR adds its codes to Owner here too; a test checks it.
 *
 * Typed as a plain record, not `as const`: callers ask `DEFAULT_ROLE_PERMISSIONS[role].includes(code)` with a
 * role chosen at run time, which does not compile when each role has its own literal tuple type.
 */
export const DEFAULT_ROLE_PERMISSIONS: Readonly<Record<RoleCode, readonly PermissionCode[]>> = {
  owner: ['product.cost.view', 'report.profit.view', 'accounting.salary.view'],
  business_manager: ['product.cost.view', 'report.profit.view'],
  branch_manager: [],
  accountant: ['product.cost.view', 'report.profit.view', 'accounting.salary.view'],
  cashier: [],
};

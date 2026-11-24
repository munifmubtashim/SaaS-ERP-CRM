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
  // Posting a sale at the counter (ADR 0022, item 3b).
  'sales.invoice.post',
  // Party, release 1 (ADR 0006 section 8, ADR 0056 section 2). Merge, import, NID, credit and the supplier
  // edit and deactivate codes come with their features.
  'party.customer.view',
  'party.customer.create',
  'party.customer.edit',
  'party.customer.deactivate',
  'party.supplier.view',
  'party.supplier.create',
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
/** ADR 0006 section 8: who may view, create, edit and deactivate parties (release 1 codes, ADR 0056). */
const PARTY_VIEW_CREATE = [
  'party.customer.view',
  'party.customer.create',
  'party.supplier.view',
  'party.supplier.create',
] as const satisfies readonly PermissionCode[];
const PARTY_ALL = [
  ...PARTY_VIEW_CREATE,
  'party.customer.edit',
  'party.customer.deactivate',
] as const satisfies readonly PermissionCode[];

export const DEFAULT_ROLE_PERMISSIONS: Readonly<Record<RoleCode, readonly PermissionCode[]>> = {
  owner: [
    'product.cost.view',
    'report.profit.view',
    'accounting.salary.view',
    'sales.invoice.post',
    ...PARTY_ALL,
  ],
  business_manager: ['product.cost.view', 'report.profit.view', ...PARTY_ALL],
  branch_manager: ['sales.invoice.post', ...PARTY_VIEW_CREATE, 'party.customer.edit'],
  accountant: ['product.cost.view', 'report.profit.view', 'accounting.salary.view', ...PARTY_ALL],
  cashier: ['sales.invoice.post', ...PARTY_VIEW_CREATE],
};

/** True when the granted codes include `code` (ADR 0051 section 2). The api refuses with it; the UI hides with it. */
export function hasPermission(granted: readonly PermissionCode[], code: PermissionCode): boolean {
  return granted.includes(code);
}

/** True when the caller holds one of the allowed system role codes. A custom role's code matches none of them. */
export function hasAnyRole(held: readonly string[], allowed: readonly RoleCode[]): boolean {
  return held.some((role) => (allowed as readonly string[]).includes(role));
}

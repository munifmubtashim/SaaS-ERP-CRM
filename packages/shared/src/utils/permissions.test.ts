import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROLE_PERMISSIONS,
  hasAnyRole,
  hasPermission,
  PERMISSIONS,
  permissionCodeSchema,
  ROLE_CODES,
  ROLE_NAMES,
  roleCodeSchema,
  type PermissionCode,
  type RoleCode,
} from './permissions.js';

// ADR 0008 section 3: five seeded roles, `module.entity.action` codes, and the provisional default mapping of
// the three codes this ADR defines. Each later module adds its own codes and mapping in its own PR.

describe('permission codes', () => {
  it('has the three codes ADR 0008 defines, sales.invoice.post (ADR 0022) and the release 1 party codes (ADR 0056)', () => {
    expect([...PERMISSIONS].sort()).toEqual([
      'accounting.salary.view',
      'party.customer.create',
      'party.customer.deactivate',
      'party.customer.edit',
      'party.customer.view',
      'party.supplier.create',
      'party.supplier.view',
      'product.cost.view',
      'report.profit.view',
      'sales.invoice.post',
    ]);
  });

  it('writes every code as module.entity.action, exactly three lowercase parts', () => {
    for (const code of PERMISSIONS) expect(code).toMatch(/^[a-z][a-z_]*\.[a-z][a-z_]*\.[a-z][a-z_]*$/);
  });

  it('has no duplicate codes', () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
  });

  it('rejects an unknown code', () => {
    expect(permissionCodeSchema.safeParse('product.cost.view').success).toBe(true);
    expect(permissionCodeSchema.safeParse('party.view').success).toBe(false);
    expect(permissionCodeSchema.safeParse('field.cost.view').success).toBe(false);
  });
});

describe('roles', () => {
  it('has exactly the five spec roles (spec C-01, D-03; ADR 0001 row C7)', () => {
    expect(ROLE_CODES).toEqual(['owner', 'business_manager', 'branch_manager', 'accountant', 'cashier']);
  });

  it('names them in English; the UI translates them by code', () => {
    expect(ROLE_NAMES).toEqual({
      owner: 'Owner',
      business_manager: 'Business Manager',
      branch_manager: 'Branch Manager',
      accountant: 'Accountant',
      cashier: 'Cashier',
    });
  });

  it('rejects an unknown role code', () => {
    expect(roleCodeSchema.safeParse('owner').success).toBe(true);
    expect(roleCodeSchema.safeParse('manager').success).toBe(false);
  });
});

describe('default role mapping (provisional, ADR 0008 section 3)', () => {
  const sorted = (codes: readonly string[]) => [...codes].sort();

  it('matches the ADR 0008 table and ADR 0056 section 2 exactly', () => {
    expect(sorted(DEFAULT_ROLE_PERMISSIONS.owner)).toEqual([
      'accounting.salary.view',
      'party.customer.create',
      'party.customer.deactivate',
      'party.customer.edit',
      'party.customer.view',
      'party.supplier.create',
      'party.supplier.view',
      'product.cost.view',
      'report.profit.view',
      'sales.invoice.post',
    ]);
    expect(sorted(DEFAULT_ROLE_PERMISSIONS.accountant)).toEqual([
      'accounting.salary.view',
      'party.customer.create',
      'party.customer.deactivate',
      'party.customer.edit',
      'party.customer.view',
      'party.supplier.create',
      'party.supplier.view',
      'product.cost.view',
      'report.profit.view',
    ]);
    expect(sorted(DEFAULT_ROLE_PERMISSIONS.business_manager)).toEqual([
      'party.customer.create',
      'party.customer.deactivate',
      'party.customer.edit',
      'party.customer.view',
      'party.supplier.create',
      'party.supplier.view',
      'product.cost.view',
      'report.profit.view',
    ]);
    expect(sorted(DEFAULT_ROLE_PERMISSIONS.branch_manager)).toEqual([
      'party.customer.create',
      'party.customer.edit',
      'party.customer.view',
      'party.supplier.create',
      'party.supplier.view',
      'sales.invoice.post',
    ]);
    expect(sorted(DEFAULT_ROLE_PERMISSIONS.cashier)).toEqual([
      'party.customer.create',
      'party.customer.view',
      'party.supplier.create',
      'party.supplier.view',
      'sales.invoice.post',
    ]);
  });

  it('gives the Cashier no party edit or deactivate, and the Branch Manager no deactivate (ADR 0006 section 8)', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.cashier).not.toContain('party.customer.edit');
    expect(DEFAULT_ROLE_PERMISSIONS.cashier).not.toContain('party.customer.deactivate');
    expect(DEFAULT_ROLE_PERMISSIONS.branch_manager).not.toContain('party.customer.deactivate');
  });

  it('gives Branch Manager and Cashier none of cost, profit or salary', () => {
    for (const role of ['branch_manager', 'cashier'] as const) {
      expect(DEFAULT_ROLE_PERMISSIONS[role]).not.toContain('product.cost.view');
      expect(DEFAULT_ROLE_PERMISSIONS[role]).not.toContain('report.profit.view');
      expect(DEFAULT_ROLE_PERMISSIONS[role]).not.toContain('accounting.salary.view');
    }
  });

  it('maps a role for every role code and nothing else', () => {
    expect(Object.keys(DEFAULT_ROLE_PERMISSIONS).sort()).toEqual([...ROLE_CODES].sort());
  });

  it('maps only codes that exist in PERMISSIONS', () => {
    const known = new Set<string>(PERMISSIONS);
    for (const codes of Object.values(DEFAULT_ROLE_PERMISSIONS)) {
      for (const code of codes) expect(known.has(code)).toBe(true);
    }
  });

  it('can be asked about any role and code (compiles with role typed as RoleCode)', () => {
    // A typecheck-level test: with an \`as const\` mapping, \`includes\` on a role chosen at run time does not
    // compile (Branch Manager's \`readonly []\` collapses the argument type to never). The seed and requireRole
    // need exactly this call.
    const allows = (role: RoleCode, code: PermissionCode): boolean =>
      DEFAULT_ROLE_PERMISSIONS[role].includes(code);
    expect(allows('owner', 'accounting.salary.view')).toBe(true);
    expect(allows('business_manager', 'accounting.salary.view')).toBe(false);
    expect(allows('cashier', 'product.cost.view')).toBe(false);
  });

  it('maps Owner explicitly to every code in PERMISSIONS (no wildcard)', () => {
    expect(sorted(DEFAULT_ROLE_PERMISSIONS.owner)).toEqual(sorted(PERMISSIONS));
  });
});

describe('the access checks the api uses (ADR 0051 section 2)', () => {
  it('hasPermission: only a granted code passes', () => {
    expect(hasPermission(['report.profit.view'], 'report.profit.view')).toBe(true);
    expect(hasPermission(['product.cost.view'], 'report.profit.view')).toBe(false);
    expect(hasPermission([], 'accounting.salary.view')).toBe(false);
  });

  it('hasAnyRole: one of the allowed role codes passes; an unknown or empty role list does not', () => {
    expect(hasAnyRole(['cashier', 'business_manager'], ['owner', 'business_manager'])).toBe(true);
    expect(hasAnyRole(['branch_manager', 'cashier'], ['owner', 'business_manager'])).toBe(false);
    expect(hasAnyRole(['custom_role'], ['owner'])).toBe(false);
    expect(hasAnyRole([], ['owner'])).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROLE_PERMISSIONS,
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
  it('has the three codes ADR 0008 defines, plus sales.invoice.post (ADR 0022, item 3b)', () => {
    expect([...PERMISSIONS].sort()).toEqual([
      'accounting.salary.view',
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

  it('matches the ADR 0008 table exactly', () => {
    expect(sorted(DEFAULT_ROLE_PERMISSIONS.owner)).toEqual([
      'accounting.salary.view',
      'product.cost.view',
      'report.profit.view',
      'sales.invoice.post',
    ]);
    expect(sorted(DEFAULT_ROLE_PERMISSIONS.accountant)).toEqual([
      'accounting.salary.view',
      'product.cost.view',
      'report.profit.view',
    ]);
    expect(sorted(DEFAULT_ROLE_PERMISSIONS.business_manager)).toEqual([
      'product.cost.view',
      'report.profit.view',
    ]);
    expect(DEFAULT_ROLE_PERMISSIONS.branch_manager).toEqual(['sales.invoice.post']);
    expect(DEFAULT_ROLE_PERMISSIONS.cashier).toEqual(['sales.invoice.post']);
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

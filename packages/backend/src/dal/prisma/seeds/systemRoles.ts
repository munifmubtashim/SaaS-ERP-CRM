import {
  AppError,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  ROLE_CODES,
  ROLE_NAMES,
  type PermissionCode,
  type RoleCode,
} from '@erp/shared';
import type { DbClient } from '../../config/db.js';

/**
 * The seed of ADR 0009 part 4 (ADR 0008 section 3): the permission list, and each organization's five system roles
 * with the default mapping from shared/src/utils/permissions.ts (#26), so code and database cannot drift.
 *
 * Run as the migration owner, never as erp_app (erp_app can't create a system role). RLS stays forced on the owner:
 * each organization's rows are written inside one transaction that first sets app.organization_id with
 * set_config(..., true), through the owner's own TO CURRENT_USER policies (ADR 0009, ADR 0050).
 *
 * Idempotent: every insert is ON CONFLICT DO NOTHING, so a second run adds only what is missing and changes or
 * deletes nothing (ADR 0008 test 8). A role whose mapping was deactivated stays deactivated.
 */

/** What each code allows (ADR 0008 section 3). Adding a code to permissions.ts without one fails the typecheck. */
const PERMISSION_DESCRIPTIONS = {
  'product.cost.view': 'See cost price on products, stock and documents',
  'report.profit.view': 'See profit and margin figures in reports and screens',
  'accounting.salary.view': 'See salary entries and amounts',
  'sales.invoice.post': 'Post a sale at the counter, with its payments',
  'sales.payment.create': 'Record a customer payment against an invoice or as an advance',
  // Party, release 1 (ADR 0006 section 8, ADR 0056 section 2).
  'party.customer.view': 'List, search and open customers',
  'party.customer.create': 'Add a customer',
  'party.customer.edit': "Edit a customer's details",
  'party.customer.deactivate': 'Deactivate a customer',
  'party.supplier.view': 'List, search and open suppliers',
  'party.supplier.create': 'Add a supplier',
} as const satisfies Record<PermissionCode, string>;

/** The global permission catalogue: every code in permissions.ts, once. No RLS on `permission`. */
export async function seedPermissions(db: DbClient): Promise<void> {
  await db.$transaction(async (tx) => {
    for (const code of PERMISSIONS) {
      await tx.$executeRaw`
        INSERT INTO permission (code, description) VALUES (${code}, ${PERMISSION_DESCRIPTIONS[code]})
        ON CONFLICT (code) DO NOTHING`;
    }
  });
}

/**
 * The five system roles of one organization and their default permissions. Returns each role's id by code.
 * Fails, without writing anything, if a role with one of the five codes exists but isn't a system role (a custom
 * role named like one; the unique (organization_id, code) would otherwise leave the organization without it).
 */
export async function seedSystemRoles(
  db: DbClient,
  organizationId: string,
): Promise<Record<RoleCode, string>> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
    for (const code of ROLE_CODES) {
      await tx.$executeRaw`
        INSERT INTO role (organization_id, code, name, is_system)
        VALUES (${organizationId}::uuid, ${code}, ${ROLE_NAMES[code]}, true)
        ON CONFLICT (organization_id, code) DO NOTHING`;
    }
    const rows = await tx.$queryRaw<{ id: string; code: RoleCode; system: boolean }[]>`
      SELECT id::text, code, is_system AS system FROM role
      WHERE organization_id = ${organizationId}::uuid AND code = ANY (${[...ROLE_CODES]}::text[])`;
    const custom = rows.find((row) => !row.system);
    if (custom || rows.length !== ROLE_CODES.length) {
      throw new AppError(
        'CONFLICT',
        `Role ${custom?.code ?? '?'} is not a system role in this organization; the seed stops here.`,
      );
    }
    const ids = Object.fromEntries(rows.map((row) => [row.code, row.id])) as Record<RoleCode, string>;
    for (const code of ROLE_CODES) {
      for (const permission of DEFAULT_ROLE_PERMISSIONS[code]) {
        await tx.$executeRaw`
          INSERT INTO role_permission (role_id, permission_code) VALUES (${ids[code]}::uuid, ${permission})
          ON CONFLICT (role_id, permission_code) DO NOTHING`;
      }
    }
    return ids;
  });
}

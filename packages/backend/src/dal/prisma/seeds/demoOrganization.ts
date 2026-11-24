import type { DbClient } from '../../config/db.js';
import { seedPermissions, seedSystemRoles } from './systemRoles.js';

/**
 * The demo organization (plan A19 note, ADR 0008 section 1): one organization, one legal entity, one business, two
 * branches, the five system roles, one owner user and a group scope for that user with the system owner role.
 * Synthetic names only. The owner's password is hashed before it reaches dal; this file only ever sees the hash.
 *
 * Run as the migration owner, through the owner's forced-RLS policies: each transaction first sets its app.*
 * values with set_config(..., true). Idempotent by fixed ids: every insert is ON CONFLICT (id) DO NOTHING, so a
 * second run writes nothing and never changes an existing owner (no password or email rotation through the seed).
 * created_by is NULL on every row ("seeded", ADR 0008 section 5).
 */
export interface DemoIds {
  organizationId: string;
  legalEntityId: string;
  businessId: string;
  /** Two branches: the Showroom, then the Service centre (docs/demo-seed-spec.md section 2). */
  branchIds: [string, string];
  ownerUserId: string;
  ownerScopeId: string;
}

/** The real demo's ids: fixed, so every run finds the same rows. Tests pass their own. */
export const DEMO_IDS: DemoIds = {
  organizationId: '0195f000-0000-7000-8000-00000000d001',
  legalEntityId: '0195f000-0000-7000-8000-00000000d002',
  businessId: '0195f000-0000-7000-8000-00000000d003',
  branchIds: ['0195f000-0000-7000-8000-00000000d004', '0195f000-0000-7000-8000-00000000d005'],
  ownerUserId: '0195f000-0000-7000-8000-00000000d006',
  ownerScopeId: '0195f000-0000-7000-8000-00000000d007',
};

export interface DemoOwner {
  /** Stored lower-cased; must contain "@" (CHECK app_user_email_has_at). */
  email: string;
  displayName: string;
  /** argon2id, made by businessLogic's Argon2PasswordHasher. Never the password. */
  passwordHash: string;
}

const BRANCHES = [
  { name: 'Showroom', shortCode: 'SHW' },
  { name: 'Service centre', shortCode: 'SVC' },
] as const;

export async function seedDemoOrganization(
  db: DbClient,
  owner: DemoOwner,
  ids: DemoIds = DEMO_IDS,
): Promise<{ organizationId: string; ownerUserId: string }> {
  await seedPermissions(db);
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT set_config('app.organization_id', ${ids.organizationId}, true),
             set_config('app.business_ids', ${ids.businessId}, true),
             set_config('app.branch_ids', ${ids.branchIds.join(',')}, true)`;
    await tx.$executeRaw`
      INSERT INTO organization (id, name) VALUES (${ids.organizationId}::uuid, 'Sample Motor Group')
      ON CONFLICT (id) DO NOTHING`;
    await tx.$executeRaw`
      INSERT INTO legal_entity (id, organization_id, name)
      VALUES (${ids.legalEntityId}::uuid, ${ids.organizationId}::uuid, 'Sample Motors Ltd.')
      ON CONFLICT (id) DO NOTHING`;
    await tx.$executeRaw`
      INSERT INTO business (id, organization_id, legal_entity_id, name)
      VALUES (${ids.businessId}::uuid, ${ids.organizationId}::uuid, ${ids.legalEntityId}::uuid, 'Sample Motors')
      ON CONFLICT (id) DO NOTHING`;
    for (const [index, branch] of BRANCHES.entries()) {
      await tx.$executeRaw`
        INSERT INTO branch (id, business_id, name, short_code)
        VALUES (${ids.branchIds[index]}::uuid, ${ids.businessId}::uuid, ${branch.name}, ${branch.shortCode})
        ON CONFLICT (id) DO NOTHING`;
    }
  });
  const roles = await seedSystemRoles(db, ids.organizationId);
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.organization_id', ${ids.organizationId}, true)`;
    await tx.$executeRaw`
      INSERT INTO app_user (id, organization_id, email, password_hash, display_name, created_by)
      VALUES (${ids.ownerUserId}::uuid, ${ids.organizationId}::uuid, ${owner.email.trim().toLowerCase()},
              ${owner.passwordHash}, ${owner.displayName}, NULL)
      ON CONFLICT (id) DO NOTHING`;
    // Group scope (both null): accepted only for the system owner role (user_scope_group_is_owner, ADR 0050 §4).
    await tx.$executeRaw`
      INSERT INTO user_scope (id, user_id, role_id, business_id, branch_id)
      VALUES (${ids.ownerScopeId}::uuid, ${ids.ownerUserId}::uuid, ${roles.owner}::uuid, NULL, NULL)
      ON CONFLICT (id) DO NOTHING`;
  });
  return { organizationId: ids.organizationId, ownerUserId: ids.ownerUserId };
}

/** One demo login besides the owner, with its ids and scope already resolved (demoBusiness.ts, ADR 0058 S1). */
export interface DemoLoginRow {
  userId: string;
  scopeId: string;
  email: string;
  displayName: string;
  role: 'business_manager' | 'branch_manager' | 'accountant' | 'cashier';
  /** Null for the whole business. */
  branchId: string | null;
}

/**
 * The four demo logins besides the owner (docs/demo-seed-spec.md section 5). Here, not in demoBusiness.ts, because
 * this seed is the one exception to ADR 0008 test 15 that writes demo users. Same rules as the owner: one password
 * hash for all four, ON CONFLICT (id) DO NOTHING, created_by NULL, each scoped to the demo business or one branch.
 */
export async function seedDemoLogins(
  db: DbClient,
  ids: DemoIds,
  logins: readonly DemoLoginRow[],
  passwordHash: string,
): Promise<void> {
  const roles = await seedSystemRoles(db, ids.organizationId);
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.organization_id', ${ids.organizationId}, true)`;
    for (const login of logins) {
      await tx.$executeRaw`
        INSERT INTO app_user (id, organization_id, email, password_hash, display_name, created_by)
        VALUES (${login.userId}::uuid, ${ids.organizationId}::uuid, ${login.email.trim().toLowerCase()},
                ${passwordHash}, ${login.displayName}, NULL)
        ON CONFLICT (id) DO NOTHING`;
      await tx.$executeRaw`
        INSERT INTO user_scope (id, user_id, role_id, business_id, branch_id)
        VALUES (${login.scopeId}::uuid, ${login.userId}::uuid, ${roles[login.role]}::uuid, ${ids.businessId}::uuid,
                ${login.branchId}::uuid)
        ON CONFLICT (id) DO NOTHING`;
    }
  });
}

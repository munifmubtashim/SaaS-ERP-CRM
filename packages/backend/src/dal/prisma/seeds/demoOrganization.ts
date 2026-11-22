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
  /** Two branches: North, then South. */
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
  { name: 'Demo Branch North', shortCode: 'DMN' },
  { name: 'Demo Branch South', shortCode: 'DMS' },
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
      INSERT INTO organization (id, name) VALUES (${ids.organizationId}::uuid, 'Demo Group')
      ON CONFLICT (id) DO NOTHING`;
    await tx.$executeRaw`
      INSERT INTO legal_entity (id, organization_id, name)
      VALUES (${ids.legalEntityId}::uuid, ${ids.organizationId}::uuid, 'Demo Motors Ltd.')
      ON CONFLICT (id) DO NOTHING`;
    await tx.$executeRaw`
      INSERT INTO business (id, organization_id, legal_entity_id, name)
      VALUES (${ids.businessId}::uuid, ${ids.organizationId}::uuid, ${ids.legalEntityId}::uuid, 'Demo Motors')
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

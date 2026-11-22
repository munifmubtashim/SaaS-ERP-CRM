import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from '../config/db.js';
import { DEMO_IDS, seedDemoOrganization, type DemoIds } from '../prisma/seeds/demoOrganization.js';
import { setScope } from './support/orgTree.js';

/**
 * The demo organization seed: one organization, one legal entity, one business, two branches, the five system
 * roles, one owner user and a group-scope user_scope with the system owner role. Idempotent; run as the migration
 * owner through forced RLS; created_by is NULL ("seeded", ADR 0008 section 5). The password is hashed before it
 * reaches dal: this file only ever sees a hash. Each test uses fresh ids (DEMO_IDS is the real demo's).
 */
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
if (!ownerUrl) throw new Error('MIGRATION_DATABASE_URL must be set (see .env.example).');

const owner: DbClient = createDbClient(ownerUrl, { poolMax: 2, txTimeoutMs: 10_000 });
const HASH = '$argon2id$v=19$m=19456,t=2,p=1$dGVzdHNhbHQ$dGVzdGhhc2g'; // not a real password's hash

afterAll(async () => {
  await owner.$disconnect();
});

function freshIds(): DemoIds {
  return {
    organizationId: randomUUID(),
    legalEntityId: randomUUID(),
    businessId: randomUUID(),
    branchIds: [randomUUID(), randomUUID()],
    ownerUserId: randomUUID(),
    ownerScopeId: randomUUID(),
  };
}

const freshEmail = () => `Demo-Owner-${randomUUID().slice(0, 8)}@Example.com`;

/** Everything the seed wrote for `ids`, read as the owner inside that organization. */
async function snapshot(ids: DemoIds) {
  return owner.$transaction(async (tx) => {
    await setScope(tx, ids.organizationId, [ids.businessId], ids.branchIds);
    const count = async (sql: TemplateStringsArray, ...values: unknown[]) =>
      ((await tx.$queryRaw<{ n: number }[]>(sql, ...values))[0]?.n ?? -1) as number;
    return {
      organizations:
        await count`SELECT count(*)::int AS n FROM organization WHERE id = ${ids.organizationId}::uuid`,
      legalEntities:
        await count`SELECT count(*)::int AS n FROM legal_entity WHERE organization_id = ${ids.organizationId}::uuid`,
      businesses:
        await count`SELECT count(*)::int AS n FROM business WHERE organization_id = ${ids.organizationId}::uuid`,
      branches:
        await count`SELECT count(*)::int AS n FROM branch WHERE business_id = ${ids.businessId}::uuid`,
      roles:
        await count`SELECT count(*)::int AS n FROM role WHERE organization_id = ${ids.organizationId}::uuid AND is_system`,
      users:
        await count`SELECT count(*)::int AS n FROM app_user WHERE organization_id = ${ids.organizationId}::uuid`,
      scopes: await count`
        SELECT count(*)::int AS n FROM user_scope s JOIN role r ON r.id = s.role_id
        WHERE s.user_id = ${ids.ownerUserId}::uuid AND r.code = 'owner' AND r.is_system
          AND s.business_id IS NULL AND s.branch_id IS NULL AND s.is_active`,
      seededBy: await count`
        SELECT count(*)::int AS n FROM app_user WHERE id = ${ids.ownerUserId}::uuid AND created_by IS NULL`,
      branchCodes: (
        await tx.$queryRaw<{ code: string }[]>`
          SELECT short_code AS code FROM branch WHERE business_id = ${ids.businessId}::uuid ORDER BY short_code`
      ).map((row) => row.code),
      user: (
        await tx.$queryRaw<{ email: string; hash: string; active: boolean }[]>`
          SELECT email, password_hash AS hash, is_active AS active FROM app_user WHERE id = ${ids.ownerUserId}::uuid`
      )[0],
    };
  });
}

describe('seedDemoOrganization', () => {
  it('creates the organization tree, the five system roles, the owner and a group scope with the owner role', async () => {
    const ids = freshIds();
    const email = freshEmail();
    await expect(
      seedDemoOrganization(owner, { email, displayName: 'Demo Owner', passwordHash: HASH }, ids),
    ).resolves.toEqual({
      organizationId: ids.organizationId,
      ownerUserId: ids.ownerUserId,
    });
    expect(await snapshot(ids)).toEqual({
      organizations: 1,
      legalEntities: 1,
      businesses: 1,
      branches: 2,
      roles: 5,
      users: 1,
      scopes: 1,
      seededBy: 1,
      branchCodes: ['DMN', 'DMS'],
      user: { email: email.toLowerCase(), hash: HASH, active: true },
    });
  });

  it('is idempotent: a second run leaves exactly the same rows', async () => {
    const ids = freshIds();
    const owner1 = { email: freshEmail(), displayName: 'Demo Owner', passwordHash: HASH };
    await seedDemoOrganization(owner, owner1, ids);
    const first = await snapshot(ids);
    await seedDemoOrganization(owner, owner1, ids);
    expect(await snapshot(ids)).toEqual(first);
  });

  it('a second run never changes an existing owner (no password or email rotation through the seed)', async () => {
    const ids = freshIds();
    const email = freshEmail();
    await seedDemoOrganization(owner, { email, displayName: 'Demo Owner', passwordHash: HASH }, ids);
    await seedDemoOrganization(
      owner,
      { email: freshEmail(), displayName: 'Other', passwordHash: 'other' },
      ids,
    );
    expect((await snapshot(ids)).user).toEqual({ email: email.toLowerCase(), hash: HASH, active: true });
  });

  it('the real demo ids are fixed, valid UUIDs, with two branches', () => {
    for (const id of [
      DEMO_IDS.organizationId,
      DEMO_IDS.legalEntityId,
      DEMO_IDS.businessId,
      ...DEMO_IDS.branchIds,
      DEMO_IDS.ownerUserId,
      DEMO_IDS.ownerScopeId,
    ]) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
    expect(DEMO_IDS.branchIds).toHaveLength(2);
  });
});

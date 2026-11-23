import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { RoleCode } from '@erp/shared';
import { createDbClient } from '../../config/db.js';
import { seedPermissions, seedSystemRoles } from '../../prisma/seeds/systemRoles.js';

/**
 * vitest globalSetup for the api isolation suite (ADR 0051 test 8, ADR 0052 test 7). The api layer may not reach the
 * database, so this dal test helper seeds, as the migration owner, two organizations and hands the tests ids and
 * session tokens through `provide`:
 *
 * - organization A: business X (branch X1) and business X2 (branch X2a); an Owner (group scope), a Business
 *   Manager of X, a Branch Manager, an Accountant and a Cashier of X1;
 * - organization B: business Y (branch Y1) and its Owner.
 *
 * Every token is random per run; sessions are inserted with SHA-256 of the token, as SessionTokens hashes them.
 */
export interface IsolationWorld {
  a: { organizationId: string; x: string; x1: string; x2: string; x2a: string };
  b: { organizationId: string; y: string; y1: string };
  /** Session cookie values by user. */
  tokens: Record<'ownerA' | 'managerX' | 'branchManagerX1' | 'accountantX1' | 'cashierX1' | 'ownerB', string>;
}

const HASH = '$argon2id$v=19$m=19456,t=2,p=1$dGVzdHNhbHQ$dGVzdGhhc2g'; // not a real password's hash

export default async function setup({
  provide,
}: {
  provide: (key: 'isolation', value: IsolationWorld) => void;
}): Promise<() => Promise<void>> {
  const ownerUrl = process.env.MIGRATION_DATABASE_URL;
  if (!ownerUrl)
    throw new Error('MIGRATION_DATABASE_URL must be set for the isolation suite (see .env.example).');
  const owner = createDbClient(ownerUrl, { poolMax: 2, txTimeoutMs: 15_000 });
  type Tx = Parameters<Parameters<typeof owner.$transaction>[0]>[0];
  const inOrg = <T>(org: string, businesses: string[], branches: string[], sql: (tx: Tx) => Promise<T>) =>
    owner.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT set_config('app.organization_id', ${org}, true),
               set_config('app.business_ids', ${businesses.join(',')}, true),
               set_config('app.branch_ids', ${branches.join(',')}, true)`;
      return sql(tx);
    });

  async function organization(businesses: { id: string; branch: string }[]) {
    const org = randomUUID();
    const legal = randomUUID();
    await inOrg(org, [], [], async (tx) => {
      await tx.$executeRaw`INSERT INTO organization (id, name) VALUES (${org}::uuid, ${`Isolation ${org}`})`;
      await tx.$executeRaw`
        INSERT INTO legal_entity (id, organization_id, name) VALUES (${legal}::uuid, ${org}::uuid, 'Isolation Legal')`;
    });
    for (const business of businesses) {
      await inOrg(org, [business.id], [business.branch], async (tx) => {
        await tx.$executeRaw`
          INSERT INTO business (id, organization_id, legal_entity_id, name)
          VALUES (${business.id}::uuid, ${org}::uuid, ${legal}::uuid, ${`Isolation ${business.id}`})`;
        await tx.$executeRaw`
          INSERT INTO branch (id, business_id, name, short_code)
          VALUES (${business.branch}::uuid, ${business.id}::uuid, 'Isolation Branch', 'ISO')`;
      });
    }
    return { org, roles: await seedSystemRoles(owner, org) };
  }

  async function user(
    org: { org: string; roles: Record<RoleCode, string> },
    role: RoleCode,
    place: { business?: string; branch?: string } = {},
  ): Promise<string> {
    const id = randomUUID();
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token, 'utf8').digest();
    await inOrg(
      org.org,
      place.business ? [place.business] : [],
      place.branch ? [place.branch] : [],
      async (tx) => {
        await tx.$executeRaw`
        INSERT INTO app_user (id, organization_id, email, password_hash, display_name)
        VALUES (${id}::uuid, ${org.org}::uuid, ${`iso-${id}@example.com`}, ${HASH}, ${`Isolation ${role}`})`;
        await tx.$executeRaw`
        INSERT INTO user_scope (user_id, role_id, business_id, branch_id)
        VALUES (${id}::uuid, ${org.roles[role]}::uuid, ${place.business ?? null}::uuid, ${place.branch ?? null}::uuid)`;
        await tx.$executeRaw`
        INSERT INTO auth_session (token_hash, user_id, organization_id, idle_expires_at, absolute_expires_at)
        VALUES (${tokenHash}, ${id}::uuid, ${org.org}::uuid, now() + interval '1 day', now() + interval '1 day')`;
      },
    );
    return token;
  }

  await seedPermissions(owner);
  const x = { id: randomUUID(), branch: randomUUID() };
  const x2 = { id: randomUUID(), branch: randomUUID() };
  const y = { id: randomUUID(), branch: randomUUID() };
  const orgA = await organization([x, x2]);
  const orgB = await organization([y]);
  const atX1 = { business: x.id, branch: x.branch };
  provide('isolation', {
    a: { organizationId: orgA.org, x: x.id, x1: x.branch, x2: x2.id, x2a: x2.branch },
    b: { organizationId: orgB.org, y: y.id, y1: y.branch },
    tokens: {
      ownerA: await user(orgA, 'owner'),
      managerX: await user(orgA, 'business_manager', { business: x.id }),
      branchManagerX1: await user(orgA, 'branch_manager', atX1),
      accountantX1: await user(orgA, 'accountant', atX1),
      cashierX1: await user(orgA, 'cashier', atX1),
      ownerB: await user(orgB, 'owner'),
    },
  });
  return async () => {
    await owner.$disconnect();
  };
}

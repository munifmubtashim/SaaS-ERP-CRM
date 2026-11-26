import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from '../config/db.js';
import { seedDemoBusiness } from '../prisma/seeds/demoBusiness.js';
import { seedDemoOrganization, type DemoIds } from '../prisma/seeds/demoOrganization.js';
import { setScope } from './support/orgTree.js';

/**
 * The demo seed's step 1 and 2 (docs/demo-seed-spec.md sections 2 to 5, ADR 0058 S1): Sample Motor Group, Sample
 * Motors, the Showroom and the Service centre with their series, the chart with all 12 roles and Opening balance
 * equity, the staff directory and the five logins. Run as the migration owner through forced RLS. Each test seeds a
 * fresh organization (its own ids from a random seed), so it reads only its own rows. Every value is invented.
 */
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
if (!ownerUrl) throw new Error('MIGRATION_DATABASE_URL must be set (see .env.example).');

const owner: DbClient = createDbClient(ownerUrl, { poolMax: 2, txTimeoutMs: 20_000 });
const HASH = '$argon2id$v=19$m=19456,t=2,p=1$dGVzdHNhbHQ$dGVzdGhhc2g'; // not a real password's hash

afterAll(async () => {
  await owner.$disconnect();
});

const freshIds = (): DemoIds => ({
  organizationId: randomUUID(),
  legalEntityId: randomUUID(),
  businessId: randomUUID(),
  branchIds: [randomUUID(), randomUUID()],
  ownerUserId: randomUUID(),
  ownerScopeId: randomUUID(),
});

async function seed(ids: DemoIds, idSeed: string) {
  const email = `demo-owner-${idSeed.slice(0, 8)}@example.com`;
  await seedDemoOrganization(owner, { email, displayName: 'Demo Owner', passwordHash: HASH }, ids);
  // app_user.email is unique across organizations, so each test's logins get their own .invalid domain.
  await seedDemoBusiness(owner, ids, { passwordHash: HASH, emailDomain: `t-${idSeed.slice(0, 8)}.invalid` });
}

/** Reads as the owner inside the demo organization's scope. */
function read<T>(
  ids: DemoIds,
  fn: (tx: Parameters<Parameters<DbClient['$transaction']>[0]>[0]) => Promise<T>,
) {
  return owner.$transaction(async (tx) => {
    await setScope(tx, ids.organizationId, [ids.businessId], ids.branchIds);
    return fn(tx);
  });
}

async function snapshot(ids: DemoIds) {
  return read(ids, async (tx) => ({
    accounts:
      await tx.$queryRaw`SELECT id, code, name, type FROM account WHERE business_id = ${ids.businessId}::uuid ORDER BY code`,
    roles:
      await tx.$queryRaw`SELECT role, account_id FROM account_role WHERE business_id = ${ids.businessId}::uuid ORDER BY role`,
    series:
      await tx.$queryRaw`SELECT branch_id, kind, prefix, width, next_value::text FROM number_series WHERE business_id = ${ids.businessId}::uuid ORDER BY branch_id, kind`,
    staff:
      await tx.$queryRaw`SELECT id, name, designation, branch_id, user_id FROM staff WHERE business_id = ${ids.businessId}::uuid ORDER BY id`,
    users:
      await tx.$queryRaw`SELECT id, email, password_hash FROM app_user WHERE organization_id = ${ids.organizationId}::uuid ORDER BY id`,
  }));
}

describe('the demo business (spec section 2)', () => {
  const ids = freshIds();
  const idSeed = randomUUID();
  let first: Awaited<ReturnType<typeof snapshot>>;

  beforeAll(async () => {
    await seed(ids, idSeed);
    first = await snapshot(ids);
  });

  it('is Sample Motor Group, Sample Motors, with the Showroom (SHW) and the Service centre (SVC)', async () => {
    const names = await read(ids, async (tx) => ({
      organization: await tx.$queryRaw`SELECT name FROM organization WHERE id = ${ids.organizationId}::uuid`,
      business: await tx.$queryRaw`SELECT name FROM business WHERE id = ${ids.businessId}::uuid`,
      branches:
        await tx.$queryRaw`SELECT name, short_code FROM branch WHERE business_id = ${ids.businessId}::uuid ORDER BY short_code`,
    }));
    expect(names).toEqual({
      organization: [{ name: 'Sample Motor Group' }],
      business: [{ name: 'Sample Motors' }],
      branches: [
        { name: 'Showroom', short_code: 'SHW' },
        { name: 'Service centre', short_code: 'SVC' },
      ],
    });
  });

  it('numbers Showroom invoices INV-, Service centre invoices SVC-2026-, and gives each branch receipts and journals', async () => {
    const [showroom, service] = ids.branchIds;
    const series = (
      first.series as { branch_id: string | null; kind: string; prefix: string; width: number }[]
    ).map((s) => ({ branch: s.branch_id, kind: s.kind, prefix: s.prefix, width: s.width }));
    expect(series).toEqual(
      expect.arrayContaining([
        { branch: showroom, kind: 'invoice', prefix: 'INV-', width: 6 },
        { branch: showroom, kind: 'receipt', prefix: 'RC-SHW-', width: 6 },
        { branch: showroom, kind: 'journal', prefix: 'JV-SHW-', width: 6 },
        { branch: service, kind: 'invoice', prefix: 'SVC-2026-', width: 6 },
        { branch: service, kind: 'receipt', prefix: 'RC-SVC-', width: 6 },
        { branch: service, kind: 'journal', prefix: 'JV-SVC-', width: 6 },
        // The business's trigger (ADR 0055): the walk-in party's companion series.
        { branch: null, kind: 'party_code', prefix: 'C-', width: 6 },
      ]),
    );
    expect(series).toHaveLength(7);
  });

  it('maps all 12 account roles (spec section 4), with the two pass-through liabilities as liabilities', async () => {
    const byRole = await read(
      ids,
      (tx) =>
        tx.$queryRaw<{ role: string; type: string }[]>`
        SELECT r.role, a.type FROM account_role r JOIN account a ON a.id = r.account_id
         WHERE r.business_id = ${ids.businessId}::uuid ORDER BY r.role`,
    );
    expect(byRole).toEqual([
      { role: 'bank', type: 'asset' },
      { role: 'card_clearing', type: 'asset' },
      { role: 'cash', type: 'asset' },
      { role: 'cost_of_goods_sold', type: 'expense' },
      { role: 'customer_advance', type: 'liability' },
      { role: 'inventory', type: 'asset' },
      { role: 'mobile_money', type: 'asset' },
      { role: 'pass_through_payable', type: 'liability' },
      { role: 'receivable', type: 'asset' },
      { role: 'sales_revenue', type: 'income' },
      { role: 'service_revenue', type: 'income' },
      { role: 'vat_output_payable', type: 'liability' },
    ]);
  });

  it('holds Opening balance equity, of type equity, mapped to no role (spec section 4a)', async () => {
    const equity = await read(
      ids,
      (tx) =>
        tx.$queryRaw<{ name: string; mapped: boolean }[]>`
        SELECT a.name, EXISTS (SELECT 1 FROM account_role r WHERE r.account_id = a.id) AS mapped
          FROM account a WHERE a.business_id = ${ids.businessId}::uuid AND a.type = 'equity'`,
    );
    expect(equity).toEqual([{ name: 'Opening balance equity', mapped: false }]);
  });

  it('has the staff directory: 25 people by the spec counts, across both branches', async () => {
    const counts = await read(
      ids,
      (tx) =>
        tx.$queryRaw<{ designation: string; n: number }[]>`
        SELECT designation, count(*)::int AS n FROM staff WHERE business_id = ${ids.businessId}::uuid
         GROUP BY designation ORDER BY designation`,
    );
    expect(counts).toEqual([
      { designation: 'Accounts', n: 2 },
      { designation: 'Admin', n: 2 },
      { designation: 'Manager', n: 2 },
      { designation: 'Office Assistant', n: 4 },
      { designation: 'Sales Executive', n: 6 },
      { designation: 'Service Manager', n: 1 },
      { designation: 'Technician', n: 8 },
    ]);
    const branches = new Set((first.staff as { branch_id: string | null }[]).map((s) => s.branch_id));
    expect(branches).toEqual(new Set(ids.branchIds));
  });

  it('has the five logins with their system roles and scopes (spec section 5); the four are staff', async () => {
    const [showroom, service] = ids.branchIds;
    const scopes = await read(
      ids,
      (tx) =>
        tx.$queryRaw<
          {
            email: string;
            role: string;
            business: string | null;
            branch: string | null;
            staff: string | null;
          }[]
        >`
        SELECT u.email, r.code AS role, s.business_id::text AS business, s.branch_id::text AS branch,
               (SELECT st.designation FROM staff st WHERE st.user_id = u.id) AS staff
          FROM app_user u JOIN user_scope s ON s.user_id = u.id JOIN role r ON r.id = s.role_id
         WHERE u.organization_id = ${ids.organizationId}::uuid ORDER BY r.code`,
    );
    expect(
      scopes.map(({ email, ...rest }) => ({ ...rest, invalidDomain: email.endsWith('.invalid') })),
    ).toEqual([
      { role: 'accountant', business: ids.businessId, branch: null, staff: 'Accounts', invalidDomain: true },
      {
        role: 'branch_manager',
        business: ids.businessId,
        branch: service,
        staff: 'Service Manager',
        invalidDomain: true,
      },
      {
        role: 'business_manager',
        business: ids.businessId,
        branch: null,
        staff: 'Manager',
        invalidDomain: true,
      },
      {
        role: 'cashier',
        business: ids.businessId,
        branch: showroom,
        staff: 'Sales Executive',
        invalidDomain: true,
      },
      { role: 'owner', business: null, branch: null, staff: null, invalidDomain: false },
    ]);
    expect((first.users as { password_hash: string }[]).every((u) => u.password_hash === HASH)).toBe(true);
  });

  it('a second run writes nothing (spec section 1)', async () => {
    await seed(ids, idSeed);
    expect(await snapshot(ids)).toEqual(first);
  });
});

describe('the demo staff and customers are invented (spec section 1)', () => {
  it('no staff name or login email names a real brand or a real domain', async () => {
    const ids = freshIds();
    const idSeed = randomUUID();
    await seed(ids, idSeed);
    const snap = await snapshot(ids);
    const text = JSON.stringify([snap.staff, snap.users]).toLowerCase();
    for (const real of ['yamaha', 'honda', 'suzuki', 'bajaj', 'hero', 'tvs', 'gmail', 'yahoo']) {
      expect(text).not.toContain(real);
    }
  });
});

import { createHash } from 'node:crypto';
import type { DbClient } from '../../config/db.js';
import { seedDemoLogins, type DemoIds } from './demoOrganization.js';

/**
 * The demo seed's steps 1 and 2 after the organization tree (docs/demo-seed-spec.md sections 2 to 5, ADR 0058 S1): both
 * branches' invoice, receipt and journal series, the chart with all 12 account roles and Opening balance equity, the
 * staff directory and the four logins besides the owner. Every name, email and phone is invented.
 *
 * Run as the migration owner, through the owner's forced-RLS policies: each transaction sets its app.* values first.
 * A second run writes nothing: every id is fixed (derived from the business id and a name) and every insert is
 * ON CONFLICT DO NOTHING. created_by is NULL on every row ("seeded", ADR 0008 section 5).
 */

/** The user id of the demo login `key` (manager, accounts, service.manager, sales) in that business. */
export const demoLoginUserId = (businessId: string, key: string) => demoId(businessId, `user:${key}`);

/** A fixed id for `name` in the business `idSeed`: the same business and name always give the same uuid. */
export function demoId(idSeed: string, name: string): string {
  const hex = createHash('sha256').update(`${idSeed}:${name}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

type RoleCode = 'business_manager' | 'branch_manager' | 'accountant' | 'cashier';

/** A login besides the owner (spec section 5). The password is never here: one hash for all four comes in. */
export interface DemoLogin {
  key: string;
  /** The part before @; the domain is the seed's (default sample-motors.invalid, a reserved TLD). */
  emailName: string;
  displayName: string;
  role: RoleCode;
  /** The whole business, or one branch (0 = Showroom, 1 = Service centre). */
  scope: 'business' | 0 | 1;
  /** The staff row this login belongs to. */
  designation: string;
}

export const DEMO_LOGINS: readonly DemoLogin[] = [
  {
    key: 'manager',
    emailName: 'manager',
    displayName: 'Sample Manager',
    role: 'business_manager',
    scope: 'business',
    designation: 'Manager',
  },
  {
    key: 'accounts',
    emailName: 'accounts',
    displayName: 'Sample Accounts',
    role: 'accountant',
    scope: 'business',
    designation: 'Accounts',
  },
  {
    key: 'service.manager',
    emailName: 'service.manager',
    displayName: 'Sample Service Manager',
    role: 'branch_manager',
    scope: 1,
    designation: 'Service Manager',
  },
  {
    key: 'sales',
    emailName: 'sales',
    displayName: 'Sample Sales',
    role: 'cashier',
    scope: 0,
    designation: 'Sales Executive',
  },
];

/** Spec section 2, decision 1: SVC- is a new row each year (year-end checklist), never a {year} token. */
const SERIES: readonly { branch: 0 | 1; kind: 'invoice' | 'receipt' | 'journal'; prefix: string }[] = [
  { branch: 0, kind: 'invoice', prefix: 'INV-' },
  { branch: 0, kind: 'receipt', prefix: 'RC-SHW-' },
  { branch: 0, kind: 'journal', prefix: 'JV-SHW-' },
  { branch: 1, kind: 'invoice', prefix: 'SVC-2026-' },
  { branch: 1, kind: 'receipt', prefix: 'RC-SVC-' },
  { branch: 1, kind: 'journal', prefix: 'JV-SVC-' },
];

/** Spec section 4: every role mapped, or nothing posts (409 journal.role_unmapped). Plus the unmapped equity account. */
const CHART: readonly { code: string; name: string; type: string; role: string | null }[] = [
  { code: '1010', name: 'Cash in hand', type: 'asset', role: 'cash' },
  { code: '1020', name: 'Bank account', type: 'asset', role: 'bank' },
  { code: '1030', name: 'bKash wallet', type: 'asset', role: 'mobile_money' },
  { code: '1040', name: 'Card clearing', type: 'asset', role: 'card_clearing' },
  { code: '1100', name: 'Customers receivable', type: 'asset', role: 'receivable' },
  { code: '1200', name: 'Inventory', type: 'asset', role: 'inventory' },
  { code: '2100', name: 'Customer advances', type: 'liability', role: 'customer_advance' },
  { code: '2200', name: 'Registration fees payable', type: 'liability', role: 'pass_through_payable' },
  { code: '2300', name: 'VAT payable', type: 'liability', role: 'vat_output_payable' },
  { code: '3000', name: 'Opening balance equity', type: 'equity', role: null },
  { code: '4000', name: 'Sales', type: 'income', role: 'sales_revenue' },
  { code: '4100', name: 'Service income', type: 'income', role: 'service_revenue' },
  { code: '5000', name: 'Cost of goods sold', type: 'expense', role: 'cost_of_goods_sold' },
];

/** Spec section 2: 25 people. Invented names; phones in the repo's fake sequential pattern (decision 3). */
const STAFF: readonly { name: string; designation: string; branch: 0 | 1 }[] = [
  { name: 'Arif Hossain', designation: 'Manager', branch: 0 },
  { name: 'Nusrat Jahan', designation: 'Manager', branch: 1 },
  { name: 'Tanvir Alam', designation: 'Accounts', branch: 0 },
  { name: 'Shirin Akter', designation: 'Accounts', branch: 0 },
  { name: 'Kamrul Islam', designation: 'Service Manager', branch: 1 },
  ...['Rubel', 'Sohel', 'Jewel', 'Masud', 'Faruk', 'Liton', 'Rasel', 'Babu'].map((first) => ({
    name: `${first} Mia`,
    designation: 'Technician',
    branch: 1 as const,
  })),
  ...['Sabbir', 'Tanjila', 'Imran', 'Mehedi', 'Sadia', 'Rakib'].map((first) => ({
    name: `${first} Rahman`,
    designation: 'Sales Executive',
    branch: 0 as const,
  })),
  { name: 'Selim Uddin', designation: 'Office Assistant', branch: 0 },
  { name: 'Halim Sheikh', designation: 'Office Assistant', branch: 0 },
  { name: 'Mamun Sarkar', designation: 'Office Assistant', branch: 1 },
  { name: 'Shafiq Molla', designation: 'Office Assistant', branch: 1 },
  { name: 'Farzana Yasmin', designation: 'Admin', branch: 0 },
  { name: 'Moniruzzaman Khan', designation: 'Admin', branch: 0 },
];

type Tx = Parameters<Parameters<DbClient['$transaction']>[0]>[0];

async function inBusiness<T>(db: DbClient, ids: DemoIds, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT set_config('app.organization_id', ${ids.organizationId}, true),
             set_config('app.business_ids', ${ids.businessId}, true),
             set_config('app.branch_ids', ${ids.branchIds.join(',')}, true)`;
    return fn(tx);
  });
}

/**
 * Seeds everything after the organization tree, for the organization `ids` names. `logins` null seeds no login
 * (runDemoSeed without DEMO_USERS_PASSWORD); the staff rows are seeded either way.
 */
export async function seedDemoBusiness(
  db: DbClient,
  ids: DemoIds,
  logins: { passwordHash: string; emailDomain?: string } | null,
): Promise<void> {
  const id = (name: string) => demoId(ids.businessId, name);

  await inBusiness(db, ids, async (tx) => {
    for (const s of SERIES) {
      await tx.$executeRaw`
        INSERT INTO number_series (id, business_id, branch_id, kind, prefix, width, next_value)
        VALUES (${id(`series:${s.branch}:${s.kind}`)}::uuid, ${ids.businessId}::uuid, ${ids.branchIds[s.branch]}::uuid,
                ${s.kind}, ${s.prefix}, 6, 1)
        ON CONFLICT DO NOTHING`;
    }
    for (const a of CHART) {
      await tx.$executeRaw`
        INSERT INTO account (id, business_id, code, name, type)
        VALUES (${id(`account:${a.code}`)}::uuid, ${ids.businessId}::uuid, ${a.code}, ${a.name}, ${a.type})
        ON CONFLICT DO NOTHING`;
      if (a.role) {
        await tx.$executeRaw`
          INSERT INTO account_role (id, business_id, role, account_id)
          VALUES (${id(`role:${a.role}`)}::uuid, ${ids.businessId}::uuid, ${a.role}, ${id(`account:${a.code}`)}::uuid)
          ON CONFLICT DO NOTHING`;
      }
    }
  });

  if (logins) {
    await seedDemoLogins(
      db,
      ids,
      DEMO_LOGINS.map((login) => ({
        userId: id(`user:${login.key}`),
        scopeId: id(`scope:${login.key}`),
        email: `${login.emailName}@${logins.emailDomain ?? 'sample-motors.invalid'}`,
        displayName: login.displayName,
        role: login.role,
        branchId: login.scope === 'business' ? null : ids.branchIds[login.scope],
      })),
      logins.passwordHash,
    );
  }
  const loginFor = new Map(DEMO_LOGINS.map((login) => [login.designation, login]));
  await inBusiness(db, ids, async (tx) => {
    for (const [index, person] of STAFF.entries()) {
      // The first person of each login's designation is that login's staff row.
      const login = loginFor.get(person.designation);
      const isFirst = STAFF.findIndex((p) => p.designation === person.designation) === index;
      const userId = logins && login && isFirst ? id(`user:${login.key}`) : null;
      await tx.$executeRaw`
        INSERT INTO staff (id, business_id, branch_id, user_id, name, phone, designation)
        VALUES (${id(`staff:${index}`)}::uuid, ${ids.businessId}::uuid, ${ids.branchIds[person.branch]}::uuid,
                ${userId}::uuid, ${person.name}, ${`+88017000001${String(index).padStart(2, '0')}`},
                ${person.designation})
        ON CONFLICT DO NOTHING`;
    }
  });
}

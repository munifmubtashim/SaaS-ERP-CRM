import {
  AppError,
  businessDateInDhaka,
  type CreatePartyBody,
  DEFAULT_ROLE_PERMISSIONS,
  formatMoney,
  loginRequestSchema,
  multiplyByQuantity,
  parseMoney,
  type PermissionCode,
  type PostedInvoice,
  type PostInvoiceInput,
  type RecordPayment,
  type SalesPayment,
  sumMoney,
} from '@erp/shared';
import {
  createDbClient,
  type DbClient,
  DEMO_IDS,
  DEMO_OPENING_SOURCE,
  DEMO_REGISTRATION_FEE_PRICE,
  demoCustomerIdsByPhone,
  type DemoIds,
  demoLoginUserId,
  demoOpeningParts,
  demoOpeningStockDone,
  demoPrices,
  demoRegistrationFeeId,
  demoSalesDone,
  demoUnitId,
  demoUnits,
  demoWalkInId,
  seedDemoBusiness,
  seedDemoCatalogue,
  seedDemoOpeningJournals,
  seedDemoOrganization,
  seedDemoVehicles,
} from '@erp/dal';
import type { IClock } from './contracts/IClock.js';
import type { ITenantScope } from './contracts/ITenantScope.js';
import type { IStockService } from './contracts/provided/IStockService.js';
import type { IPasswordHasher } from './contracts/IPasswordHasher.js';

/** What the demo seed needs, read from the environment by scripts/seedDemo.ts. */
export interface DemoSeedInput {
  /** The migration owner's URL: the seed writes through the owner's forced-RLS policies, never as erp_app. */
  migrationDatabaseUrl: string;
  /** DEMO_OWNER_EMAIL. */
  ownerEmail: string;
  /** DEMO_OWNER_PASSWORD. Hashed here; never stored, logged or put in an error. */
  ownerPassword: string;
  /**
   * DEMO_USERS_PASSWORD: the four other logins share it (docs/demo-seed-spec.md section 5). Hashed here; never
   * stored, logged or put in an error. Without it the series, chart and staff are seeded, but no other login.
   */
  usersPassword?: string;
  /** The four logins' email domain; default sample-motors.invalid. Tests pass their own. */
  usersEmailDomain?: string;
  /** The app's URL (DATABASE_URL) the caller built `paths` on; checked by the same guard, before anything is written. */
  appDatabaseUrl?: string;
  /** NODE_ENV: the demo seed refuses to run in production. */
  nodeEnv: string | undefined;
}

/** The demo seed writes a known owner login, so it runs only against a database on this machine. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** The login form's own rules (shared loginRequestSchema): a valid login, and here an email, not a phone. */
const loginSchema = loginRequestSchema.shape.login;
const passwordSchema = loginRequestSchema.shape.password;

/**
 * The real paths the Manager-driven steps go through (ADR 0058 section 2), built by the caller with createManagers on
 * DATABASE_URL and the seed's own clock (scripts/seedDemo.ts, or a test): businessLogic's classes are wired only there.
 * The opening is dated `clock.now()`.
 */
export interface DemoSeedPaths {
  stock: IStockService;
  tenantScope: ITenantScope;
  /** `set` steps the clock for the sales (S3); without it, or without party and sales, steps 6 and 7 are skipped. */
  clock: IClock & { set?: (at: Date) => void };
  party?: DemoSalesPaths['party'];
  sales?: DemoSalesPaths['sales'];
}

/**
 * Seeds the demo organization and its owner (dal's seedDemoOrganization), then its series, chart, staff and the four
 * other logins (dal's seedDemoBusiness, ADR 0058 S1), after hashing the owner's password with
 * the given hasher (Argon2PasswordHasher in the script). Validates both values first, so nothing is written for a
 * bad email or a password the login form would refuse. Idempotent: a second run writes nothing.
 */
export async function runDemoSeed(
  input: DemoSeedInput,
  hasher: IPasswordHasher,
  ids: DemoIds = DEMO_IDS,
  paths?: DemoSeedPaths,
): Promise<{ organizationId: string; ownerUserId: string }> {
  if (input.nodeEnv === 'production') {
    throw new AppError('FORBIDDEN', 'The demo seed never runs with NODE_ENV=production.');
  }
  for (const url of [input.migrationDatabaseUrl, input.appDatabaseUrl]) {
    if (url !== undefined && !LOCAL_HOSTS.has(new URL(url).hostname)) {
      throw new AppError('FORBIDDEN', 'The demo seed runs only against a database on localhost.');
    }
  }
  const email = input.ownerEmail.trim();
  if (!email.includes('@') || !loginSchema.safeParse(email).success) {
    throw new AppError('VALIDATION_FAILED', 'DEMO_OWNER_EMAIL must be an email address.');
  }
  if (!passwordSchema.safeParse(input.ownerPassword).success) {
    throw new AppError('VALIDATION_FAILED', 'DEMO_OWNER_PASSWORD must be 8 to 128 characters.');
  }
  if (input.usersPassword !== undefined && !passwordSchema.safeParse(input.usersPassword).success) {
    throw new AppError('VALIDATION_FAILED', 'DEMO_USERS_PASSWORD must be 8 to 128 characters.');
  }
  const passwordHash = await hasher.hash(input.ownerPassword);
  const usersHash = input.usersPassword === undefined ? null : await hasher.hash(input.usersPassword);
  const db = createDbClient(input.migrationDatabaseUrl, { poolMax: 1, txTimeoutMs: 30_000 });
  try {
    const seeded = await seedDemoOrganization(db, { email, displayName: 'Demo Owner', passwordHash }, ids);
    await seedDemoBusiness(
      db,
      ids,
      usersHash === null ? null : { passwordHash: usersHash, emailDomain: input.usersEmailDomain },
    );
    await seedDemoCatalogue(db, ids);
    await seedDemoVehicles(db, ids);
    if (paths) {
      if (!(await demoOpeningStockDone(db, ids))) await moveOpeningStock(paths, ids);
      await seedDemoOpeningJournals(db, ids, businessDateInDhaka(paths.clock.now()));
      const { party, sales, clock } = paths;
      const set = clock.set;
      if (party && sales && set) {
        await seedDemoSales(
          db,
          ids,
          { tenantScope: paths.tenantScope, clock: { now: () => clock.now(), set }, party, sales },
          {
            ownerUserId: ids.ownerUserId,
            // The sales login (cashier at the Showroom) sells, when the logins are seeded; else the owner.
            sellerUserId: usersHash === null ? ids.ownerUserId : demoLoginUserId(ids.businessId, 'sales'),
          },
        );
      }
    }
    return seeded;
  } finally {
    await db.$disconnect();
  }
}

/**
 * Step 4 (spec section 2): the parts by quantity, then each chassis unit, into the Showroom through the real stock
 * path (IStockService.move, kind opening, invariant 3), in one transaction as erp_app, dated by the paths' clock.
 * Parts and units each carry their own cost (invariant 7).
 */
async function moveOpeningStock({ stock, tenantScope }: DemoSeedPaths, ids: DemoIds): Promise<void> {
  const showroom = ids.branchIds[0];
  const source = { type: DEMO_OPENING_SOURCE, id: ids.businessId };
  await tenantScope.run(
    {
      organizationId: ids.organizationId,
      businessIds: [ids.businessId],
      branchIds: [showroom],
      branchId: showroom,
    },
    () =>
      stock.move([
        ...demoOpeningParts(ids).map((part) => ({
          productId: part.productId,
          branchId: showroom,
          qtyDelta: part.qty,
          unitCost: part.unitCost,
          kind: 'opening' as const,
          source,
        })),
        ...demoUnits(ids).map((unit) => ({
          productId: unit.productId,
          branchId: showroom,
          qtyDelta: '1.000',
          unitId: unit.unitId,
          unitCost: unit.unitCost,
          kind: 'opening' as const,
          source,
        })),
      ]),
  );
}

type TenantScopeArg = Parameters<ITenantScope['run']>[0];

/**
 * The demo seed's steps 6 and 7 (docs/demo-seed-spec.md section 2, ADR 0058 S3): 20 customers through PartyManager,
 * then 25 sales and their payments through SalesManager.postInvoice and recordPayment, each dated by stepping the
 * seed's clock a day at a time after the opening day. Through the real paths only, so each document posts its journal
 * and its stock movements in one transaction (invariant 4). Every name, address, phone and transaction id is invented.
 */

/** The paths these steps use, typed by what they need (businessLogic's classes are wired only in index.ts). */
export interface DemoSalesPaths {
  tenantScope: ITenantScope;
  clock: { now(): Date; set(at: Date): void };
  party: {
    create(
      input: CreatePartyBody,
      actor: { userId: string; branchId: string | null; permissions: readonly PermissionCode[] },
    ): Promise<{ id: string }>;
  };
  sales: {
    postInvoice(input: PostInvoiceInput, where: { branchId: string; userId: string }): Promise<PostedInvoice>;
    recordPayment(input: RecordPayment, where: { branchId: string; userId: string }): Promise<SalesPayment>;
  };
}

/** [name, village, upazila, district]: invented people and villages, real upazila and district names (decision 4). */
const CUSTOMERS: readonly [string, string, string, string][] = [
  ['Abdul Karim', 'Char Kalia', 'Savar', 'Dhaka'],
  ['Rina Begum', 'Purba Para', 'Tongi', 'Gazipur'],
  ['Shahin Alam', 'Dakshin Gram', 'Keraniganj', 'Dhaka'],
  ['Morshed Ali', 'Uttar Chak', 'Narsingdi Sadar', 'Narsingdi'],
  ['Sumaiya Khatun', 'Moddho Para', 'Rupganj', 'Narayanganj'],
  ['Nazrul Hasan', 'Bil Para', 'Kaliganj', 'Gazipur'],
  ['Jahanara Parvin', 'Nodir Par', 'Dhamrai', 'Dhaka'],
  ['Kamal Uddin', 'Bagan Bari', 'Sreepur', 'Gazipur'],
  ['Asma Akter', 'Haat Khola', 'Sonargaon', 'Narayanganj'],
  ['Rafiqul Islam', 'Kanchan Gram', 'Manikganj Sadar', 'Manikganj'],
  ['Delwar Hossain', 'Pukur Par', 'Munshiganj Sadar', 'Munshiganj'],
  ['Mahmuda Sultana', 'Chhoto Chak', 'Kapasia', 'Gazipur'],
  ['Habibur Rahman', 'Boro Bari', 'Nawabganj', 'Dhaka'],
  ['Tahmina Ferdous', 'Mollah Para', 'Araihazar', 'Narayanganj'],
  ['Anwar Hossain', 'Sarker Para', 'Shibpur', 'Narsingdi'],
  ['Shamim Reza', 'Mia Bari', 'Dohar', 'Dhaka'],
  ['Lipi Rani Das', 'Paschim Gram', 'Singair', 'Manikganj'],
  ['Mizanur Rahman', 'Khal Par', 'Sirajdikhan', 'Munshiganj'],
  ['Farida Yasmin', 'Kumar Para', 'Monohardi', 'Narsingdi'],
  ['Jasim Uddin', 'Notun Hat', 'Kaliakair', 'Gazipur'],
];

/** Decision 3: the repo's obviously fake sequential phones. */
const customerPhone = (index: number) => `+88017000000${String(index + 1).padStart(2, '0')}`;

type DemoLine = { part: number; qty: string } | { model: number; unit: number; fee?: true };
interface DemoSale {
  /** Days after the opening day. */
  day: number;
  /** A customer's index, or the walk-in party (paid in full only). */
  customer: number | 'walk-in';
  lines: DemoLine[];
  /** full: paid at the sale; part: some paid at the sale; due: nothing paid. */
  pay: 'full' | 'part' | 'due';
  method: 'cash' | 'bkash';
  /** A later payment on a partly paid sale, through recordPayment, this many days after the sale. */
  laterAfter?: number;
}

/** Spec section 2: 18 paid in full, 4 partly paid, 3 fully due; 5 bike sales, 3 of them with the registration fee. */
const SALES: readonly DemoSale[] = [
  {
    day: 1,
    customer: 'walk-in',
    lines: [
      { part: 0, qty: '1' },
      { part: 22, qty: '1' },
    ],
    pay: 'full',
    method: 'cash',
  },
  { day: 2, customer: 0, lines: [{ model: 0, unit: 0, fee: true }], pay: 'full', method: 'bkash' },
  { day: 3, customer: 'walk-in', lines: [{ part: 9, qty: '2' }], pay: 'full', method: 'cash' },
  {
    day: 4,
    customer: 1,
    lines: [
      { part: 28, qty: '1' },
      { part: 32, qty: '1' },
    ],
    pay: 'full',
    method: 'cash',
  },
  {
    day: 5,
    customer: 2,
    lines: [
      { part: 4, qty: '1' },
      { part: 5, qty: '1' },
    ],
    pay: 'part',
    method: 'cash',
    laterAfter: 6,
  },
  { day: 6, customer: 'walk-in', lines: [{ part: 23, qty: '2' }], pay: 'full', method: 'bkash' },
  { day: 7, customer: 3, lines: [{ model: 1, unit: 0, fee: true }], pay: 'full', method: 'bkash' },
  {
    day: 8,
    customer: 4,
    lines: [
      { part: 33, qty: '1' },
      { part: 35, qty: '1' },
    ],
    pay: 'full',
    method: 'cash',
  },
  {
    day: 9,
    customer: 'walk-in',
    lines: [
      { part: 14, qty: '2' },
      { part: 15, qty: '1' },
    ],
    pay: 'full',
    method: 'cash',
  },
  { day: 10, customer: 5, lines: [{ part: 16, qty: '1' }], pay: 'due', method: 'cash' },
  {
    day: 11,
    customer: 6,
    lines: [
      { part: 7, qty: '1' },
      { part: 27, qty: '1' },
    ],
    pay: 'full',
    method: 'bkash',
  },
  { day: 12, customer: 7, lines: [{ model: 3, unit: 0 }], pay: 'part', method: 'cash', laterAfter: 9 },
  {
    day: 13,
    customer: 'walk-in',
    lines: [
      { part: 10, qty: '1' },
      { part: 13, qty: '1' },
    ],
    pay: 'full',
    method: 'cash',
  },
  { day: 15, customer: 8, lines: [{ part: 18, qty: '1' }], pay: 'full', method: 'cash' },
  {
    day: 16,
    customer: 9,
    lines: [
      { part: 30, qty: '1' },
      { part: 31, qty: '1' },
    ],
    pay: 'part',
    method: 'bkash',
  },
  {
    day: 17,
    customer: 'walk-in',
    lines: [
      { part: 24, qty: '1' },
      { part: 25, qty: '2' },
    ],
    pay: 'full',
    method: 'cash',
  },
  { day: 18, customer: 10, lines: [{ model: 2, unit: 0, fee: true }], pay: 'full', method: 'bkash' },
  {
    day: 20,
    customer: 11,
    lines: [
      { part: 1, qty: '1' },
      { part: 11, qty: '1' },
    ],
    pay: 'full',
    method: 'cash',
  },
  {
    day: 21,
    customer: 12,
    lines: [
      { part: 17, qty: '1' },
      { part: 20, qty: '1' },
    ],
    pay: 'due',
    method: 'cash',
  },
  {
    day: 22,
    customer: 'walk-in',
    lines: [
      { part: 26, qty: '2' },
      { part: 37, qty: '1' },
    ],
    pay: 'full',
    method: 'bkash',
  },
  { day: 24, customer: 13, lines: [{ model: 4, unit: 0 }], pay: 'due', method: 'cash' },
  {
    day: 26,
    customer: 14,
    lines: [
      { part: 2, qty: '1' },
      { part: 34, qty: '1' },
    ],
    pay: 'full',
    method: 'cash',
  },
  { day: 28, customer: 15, lines: [{ part: 19, qty: '1' }], pay: 'part', method: 'cash' },
  {
    day: 31,
    customer: 'walk-in',
    lines: [
      { part: 36, qty: '2' },
      { part: 38, qty: '1' },
    ],
    pay: 'full',
    method: 'cash',
  },
  {
    day: 35,
    customer: 16,
    lines: [
      { part: 29, qty: '1' },
      { part: 3, qty: '2' },
    ],
    pay: 'full',
    method: 'bkash',
  },
];

const DAY_MS = 86_400_000;
/** An invented bKash transaction id, the same for the same sale on every run. */
const bkashRef = (index: number, later = false) => `BK${later ? 'L' : 'S'}${String(4_310_000 + index * 37)}`;

/**
 * Runs steps 6 and 7 for the demo business at the Showroom. Customers are created only when missing (by phone); the
 * sales only while the business has no invoice. `db` is the owner's client, for the two reads that make a second run
 * write nothing.
 */
export async function seedDemoSales(
  db: DbClient,
  ids: DemoIds,
  paths: DemoSalesPaths,
  people: { ownerUserId: string; sellerUserId: string },
): Promise<void> {
  const showroom = ids.branchIds[0];
  const scope = {
    organizationId: ids.organizationId,
    businessIds: [ids.businessId],
    branchIds: [showroom],
    branchId: showroom,
  };
  const where = { branchId: showroom, userId: people.sellerUserId };
  const opening = paths.clock.now();
  const at = (day: number) => paths.clock.set(new Date(opening.getTime() + day * DAY_MS));
  try {
    await customersThenSales(db, ids, paths, people, { scope, where, at });
  } finally {
    // Back to the opening day, so a second run starts where the first did.
    paths.clock.set(opening);
  }
}

async function customersThenSales(
  db: DbClient,
  ids: DemoIds,
  paths: DemoSalesPaths,
  people: { ownerUserId: string; sellerUserId: string },
  {
    scope,
    where,
    at,
  }: { scope: TenantScopeArg; where: { branchId: string; userId: string }; at: (day: number) => void },
): Promise<void> {
  const showroom = ids.branchIds[0];

  // Step 6: customers, created by the owner at the Showroom, through the party rules (codes from party_code).
  const phones = CUSTOMERS.map((_, index) => customerPhone(index));
  const existing = await demoCustomerIdsByPhone(db, ids, phones);
  for (const [index, [name, village, upazila, district]] of CUSTOMERS.entries()) {
    if (existing.has(customerPhone(index))) continue;
    at(0);
    const created = await paths.tenantScope.run(scope, () =>
      paths.party.create(
        {
          name,
          nameBn: null,
          kind: 'person',
          isCustomer: true,
          isSupplier: false,
          phone: customerPhone(index),
          altPhone: null,
          email: null,
          address: `${village}, ${upazila}, ${district}`,
          area: upazila,
          creditLimit: null,
          payTermDays: null,
          confirmDuplicate: false,
        },
        { userId: people.ownerUserId, branchId: showroom, permissions: DEFAULT_ROLE_PERMISSIONS.owner },
      ),
    );
    existing.set(customerPhone(index), created.id);
  }

  // Step 7: the sales and their payments, once.
  if (await demoSalesDone(db, ids)) return;
  const prices = demoPrices(ids);
  const walkIn = await demoWalkInId(db, ids);
  for (const [index, sale] of SALES.entries()) {
    const partyId = sale.customer === 'walk-in' ? walkIn : existing.get(customerPhone(sale.customer));
    if (!partyId) throw new Error(`Demo customer ${String(sale.customer)} is missing.`);
    const lines = sale.lines.flatMap((line) =>
      'part' in line
        ? [{ productId: prices.parts[line.part]?.productId ?? '', serialUnitId: null, qty: line.qty }]
        : [
            {
              productId: prices.models[line.model]?.productId ?? '',
              serialUnitId: demoUnitId(ids, line.model, line.unit),
              qty: '1',
            },
            ...(line.fee ? [{ productId: demoRegistrationFeeId(ids), serialUnitId: null, qty: '1' }] : []),
          ],
    );
    const total = sumMoney(
      sale.lines.flatMap((line) =>
        'part' in line
          ? [multiplyByQuantity(parseMoney(prices.parts[line.part]?.price ?? '0.00'), line.qty)]
          : [
              parseMoney(prices.models[line.model]?.price ?? '0.00'),
              ...(line.fee ? [parseMoney(DEMO_REGISTRATION_FEE_PRICE)] : []),
            ],
      ),
    );
    const isBike = sale.lines.some((line) => 'model' in line);
    const atSale =
      sale.pay === 'full'
        ? formatMoney(total)
        : sale.pay === 'part'
          ? isBike
            ? '80000.00'
            : '300.00'
          : null;
    at(sale.day);
    const customerName = sale.customer === 'walk-in' ? null : (CUSTOMERS[sale.customer]?.[0] ?? null);
    const invoice = await paths.tenantScope.run(scope, () =>
      paths.sales.postInvoice(
        {
          partyId,
          customerName,
          lines,
          discount: '0.00',
          payments:
            atSale === null
              ? []
              : [
                  {
                    method: sale.method,
                    amount: atSale,
                    externalRef: sale.method === 'bkash' ? bkashRef(index) : null,
                  },
                ],
        },
        where,
      ),
    );
    if (sale.laterAfter !== undefined) {
      at(sale.day + sale.laterAfter);
      await paths.tenantScope.run(scope, () =>
        paths.sales.recordPayment(
          {
            partyId,
            invoiceId: invoice.id,
            method: 'bkash',
            amount: isBike ? '40000.00' : '200.00',
            externalRef: bkashRef(index, true),
            note: 'Paid part of the due',
          },
          where,
        ),
      );
    }
  }
}

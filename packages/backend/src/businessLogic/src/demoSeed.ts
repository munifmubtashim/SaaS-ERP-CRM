import { AppError, businessDateInDhaka, loginRequestSchema } from '@erp/shared';
import {
  createDbClient,
  DEMO_IDS,
  DEMO_OPENING_SOURCE,
  demoOpeningParts,
  demoOpeningStockDone,
  demoUnits,
  seedDemoBusiness,
  seedDemoCatalogue,
  seedDemoOpeningJournals,
  seedDemoOrganization,
  seedDemoVehicles,
  type DemoIds,
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
  clock: IClock;
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

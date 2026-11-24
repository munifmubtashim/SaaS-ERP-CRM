import { AppError, loginRequestSchema } from '@erp/shared';
import { createDbClient, seedDemoBusiness, seedDemoOrganization, DEMO_IDS, type DemoIds } from '@erp/dal';
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
  /** NODE_ENV: the demo seed refuses to run in production. */
  nodeEnv: string | undefined;
}

/** The demo seed writes a known owner login, so it runs only against a database on this machine. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** The login form's own rules (shared loginRequestSchema): a valid login, and here an email, not a phone. */
const loginSchema = loginRequestSchema.shape.login;
const passwordSchema = loginRequestSchema.shape.password;

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
): Promise<{ organizationId: string; ownerUserId: string }> {
  if (input.nodeEnv === 'production') {
    throw new AppError('FORBIDDEN', 'The demo seed never runs with NODE_ENV=production.');
  }
  if (!LOCAL_HOSTS.has(new URL(input.migrationDatabaseUrl).hostname)) {
    throw new AppError('FORBIDDEN', 'The demo seed runs only against a database on localhost.');
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
    return seeded;
  } finally {
    await db.$disconnect();
  }
}

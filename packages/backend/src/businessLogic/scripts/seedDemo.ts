/**
 * npm run db:seed: seeds the demo (ADR 0009 part 4, ADR 0058) into the database MIGRATION_DATABASE_URL names, as the
 * migration owner, and moves its opening stock through the app's own path at DATABASE_URL. Reads DEMO_OWNER_EMAIL and DEMO_OWNER_PASSWORD from the
 * environment (or the repo-root .env); hashes the password with Argon2PasswordHasher. Prints only ids: never the
 * password, its hash or the email. Idempotent: safe to run again.
 */
import { Argon2PasswordHasher } from '../src/Argon2PasswordHasher.js';
import { runDemoSeed } from '../src/demoSeed.js';
import { createManagers, DenyAllRoleSource } from '../src/index.js';

const required = [
  'MIGRATION_DATABASE_URL',
  'DATABASE_URL',
  'DEMO_OWNER_EMAIL',
  'DEMO_OWNER_PASSWORD',
  'DEMO_USERS_PASSWORD',
] as const;
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Set ${missing.join(', ')} first (see .env.example). Nothing was written.`);
  process.exit(1);
}

// The seed's opening day: 42 days ago (ADR 0058 section 3). Opening stock and the opening journal carry its date.
const opening = new Date(Date.now() - 42 * 86_400_000);
let now = opening;
// The seed steps this clock a day at a time for its sales (S3), and puts it back on the opening day after.
const clock = { now: () => now, set: (at: Date) => (now = at) };
const { managers, provided, tenantScope, close } = createManagers({
  databaseUrl: process.env.DATABASE_URL ?? '',
  version: 'demo-seed',
  dbPoolMax: 1,
  dbTxTimeoutMs: 60_000,
  roleSource: new DenyAllRoleSource(),
  clock,
});

try {
  const result = await runDemoSeed(
    {
      migrationDatabaseUrl: process.env.MIGRATION_DATABASE_URL ?? '',
      appDatabaseUrl: process.env.DATABASE_URL ?? '',
      ownerEmail: process.env.DEMO_OWNER_EMAIL ?? '',
      ownerPassword: process.env.DEMO_OWNER_PASSWORD ?? '',
      usersPassword: process.env.DEMO_USERS_PASSWORD ?? '',
      nodeEnv: process.env.NODE_ENV,
    },
    new Argon2PasswordHasher(),
    undefined,
    { stock: provided.stock, tenantScope, clock, party: managers.party, sales: managers.sales },
  );
  console.log(
    `Demo organization seeded: organization ${result.organizationId}, owner user ${result.ownerUserId}.`,
  );
} catch (error) {
  console.error(`Demo seed failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
} finally {
  await close();
}

/**
 * npm run db:seed: seeds the demo organization and its owner (ADR 0009 part 4, plan A19 note) into the database
 * MIGRATION_DATABASE_URL names, as the migration owner. Reads DEMO_OWNER_EMAIL and DEMO_OWNER_PASSWORD from the
 * environment (or the repo-root .env); hashes the password with Argon2PasswordHasher. Prints only ids: never the
 * password, its hash or the email. Idempotent: safe to run again.
 */
import { Argon2PasswordHasher } from '../src/Argon2PasswordHasher.js';
import { runDemoSeed } from '../src/demoSeed.js';

const required = [
  'MIGRATION_DATABASE_URL',
  'DEMO_OWNER_EMAIL',
  'DEMO_OWNER_PASSWORD',
  'DEMO_USERS_PASSWORD',
] as const;
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Set ${missing.join(', ')} first (see .env.example). Nothing was written.`);
  process.exit(1);
}

try {
  const result = await runDemoSeed(
    {
      migrationDatabaseUrl: process.env.MIGRATION_DATABASE_URL ?? '',
      ownerEmail: process.env.DEMO_OWNER_EMAIL ?? '',
      ownerPassword: process.env.DEMO_OWNER_PASSWORD ?? '',
      usersPassword: process.env.DEMO_USERS_PASSWORD ?? '',
      nodeEnv: process.env.NODE_ENV,
    },
    new Argon2PasswordHasher(),
  );
  console.log(
    `Demo organization seeded: organization ${result.organizationId}, owner user ${result.ownerUserId}.`,
  );
} catch (error) {
  console.error(`Demo seed failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exit(1);
}

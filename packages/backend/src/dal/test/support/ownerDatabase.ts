import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createDbClient, type DbClient } from '../../config/db.js';
import { DAL_DIR } from '../sqlFunctions.js';

/**
 * A migration owner that is neither superuser nor BYPASSRLS (a hosted database such as Neon), for owner-path tests.
 * The dev and CI owner is a superuser, which skips RLS, so this makes a throwaway role and a database it owns and
 * runs every migration as that role; RLS stays forced on it through its own `TO CURRENT_USER` policies. `drop()`
 * removes the database and the role (test infrastructure, not rows). Same setup as OrganizationTreeOwner.int.test.ts.
 */
export interface OwnerDatabase {
  client: DbClient;
  drop: () => Promise<void>;
}

export async function createOwnerDatabase(superUrl: string): Promise<OwnerDatabase> {
  const tag = randomBytes(4).toString('hex');
  const role = `tbl_owner_t_${tag}`;
  const database = `erp_tbl_owner_t_${tag}`;
  const password = randomBytes(12).toString('hex');
  const url = new URL(superUrl);
  url.username = role;
  url.password = password;
  url.pathname = `/${database}`;

  const superuser = createDbClient(superUrl, { poolMax: 1, txTimeoutMs: 30_000 });
  await superuser.$executeRawUnsafe(
    `CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '${password}'`,
  );
  await superuser.$executeRawUnsafe(`CREATE DATABASE ${database} OWNER ${role}`);
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: DAL_DIR,
    env: { ...process.env, MIGRATION_DATABASE_URL: url.toString() },
    stdio: 'pipe',
  });
  const client = createDbClient(url.toString(), { poolMax: 2, txTimeoutMs: 10_000 });

  return {
    client,
    drop: async () => {
      await client.$disconnect();
      await superuser.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
      await superuser.$executeRawUnsafe(`DROP ROLE IF EXISTS ${role}`);
      await superuser.$disconnect();
    },
  };
}

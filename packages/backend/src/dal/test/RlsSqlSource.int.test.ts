import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DAL_DIR, functionsIn, latestMigrationFunctions } from './sqlFunctions.js';

/**
 * dal/sql/rls/tenancy.sql is the readable source; the migrations are what the database gets. This test fails
 * when they define different functions, so the two cannot drift apart (Farhan, #19). For each function the
 * LATEST migration that defines it wins, so a later CREATE OR REPLACE migration is compared, not the first.
 * Reads files only; it is an *.int.test.ts because dal runs only those.
 */
const SOURCE = `${DAL_DIR}sql/rls/tenancy.sql`;

const source = functionsIn(readFileSync(SOURCE, 'utf8'));
const migrated = latestMigrationFunctions();

describe('dal/sql/rls/tenancy.sql matches the migrations', () => {
  it('the source defines the three RLS scope functions, the login key and the session key', () => {
    expect([...source.keys()].sort()).toEqual([
      'app_branch_ids',
      'app_business_ids',
      'app_login_key',
      'app_organization_id',
      'app_session_key',
    ]);
  });

  it('every app_* function in the migrations is in the source, and no other', () => {
    const migratedAppFunctions = [...migrated.keys()].filter((name) => name.startsWith('app_')).sort();
    expect(migratedAppFunctions).toEqual([...source.keys()].sort());
  });

  it.each([...source.keys()])(
    "%s is created as public.<name>, independent of the migration role's search_path",
    (name) => {
      expect(source.get(name)).toMatch(new RegExp(`^CREATE FUNCTION public\\.${name}\\(`));
      expect(migrated.get(name)).toMatch(new RegExp(`^CREATE FUNCTION public\\.${name}\\(`));
    },
  );

  it.each([...source.keys()])('%s is defined the same way in the source and its latest migration', (name) => {
    expect(migrated.get(name)).toBe(source.get(name));
  });
});

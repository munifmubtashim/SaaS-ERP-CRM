import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * dal/sql/rls/tenancy.sql is the readable source; the migrations are what the database gets. This test fails
 * when they define different functions, so the two cannot drift apart (Farhan, #19). For each function the
 * LATEST migration that defines it wins, so a later CREATE OR REPLACE migration is compared, not the first.
 * Reads files only; it is an *.int.test.ts because dal runs only those.
 */
const dal = fileURLToPath(new URL('..', import.meta.url));
const SOURCE = `${dal}sql/rls/tenancy.sql`;
const MIGRATIONS = `${dal}prisma/migrations`;

/** Every CREATE [OR REPLACE] FUNCTION statement, keyed by its name without the schema. */
function functionsIn(sql: string): Map<string, string> {
  const withoutComments = sql.replace(/--[^\n]*/g, '');
  const statements = withoutComments.matchAll(
    /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([\w.]+)\s*\([\s\S]*?\$\$;/g,
  );
  const found = new Map<string, string>();
  for (const [statement, name = ''] of statements) {
    const normalised = statement
      .replace(/^CREATE\s+OR\s+REPLACE\s+FUNCTION/, 'CREATE FUNCTION')
      .replace(/\s+/g, ' ')
      .trim();
    found.set(name.replace(/^public\./, ''), normalised);
  }
  return found;
}

function latestMigrationFunctions(): Map<string, string> {
  const latest = new Map<string, string>();
  const folders = readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(); // timestamp prefixes sort in the order Prisma applies them
  for (const folder of folders) {
    const sql = readFileSync(`${MIGRATIONS}/${folder}/migration.sql`, 'utf8');
    for (const [name, statement] of functionsIn(sql)) latest.set(name, statement);
  }
  return latest;
}

const source = functionsIn(readFileSync(SOURCE, 'utf8'));
const migrated = latestMigrationFunctions();

describe('dal/sql/rls/tenancy.sql matches the migrations', () => {
  it('the source defines the three RLS policy functions', () => {
    expect([...source.keys()].sort()).toEqual(['app_branch_ids', 'app_business_ids', 'app_organization_id']);
  });

  it('every app_* function in the migrations is in the source, and no other', () => {
    const migratedAppFunctions = [...migrated.keys()].filter((name) => name.startsWith('app_')).sort();
    expect(migratedAppFunctions).toEqual([...source.keys()].sort());
  });

  it.each([...source.keys()])('%s is defined the same way in the source and its latest migration', (name) => {
    expect(migrated.get(name)).toBe(source.get(name));
  });
});

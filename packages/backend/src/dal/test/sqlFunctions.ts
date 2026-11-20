import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Helpers for the "dal/sql source matches the migrations" tests. dal/sql holds the readable SQL; migrations are
 * what the database gets. Not a test file itself (dal runs only *.int.test.ts).
 */
export const DAL_DIR = fileURLToPath(new URL('..', import.meta.url));
export const MIGRATIONS_DIR = `${DAL_DIR}prisma/migrations`;

/** Every CREATE [OR REPLACE] FUNCTION statement, keyed by its name without the schema, whitespace normalised. */
export function functionsIn(sql: string): Map<string, string> {
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

/** Migration folders in the order Prisma applies them (timestamp prefixes sort correctly). */
export function migrationFolders(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export function migrationSql(folder: string): string {
  return readFileSync(`${MIGRATIONS_DIR}/${folder}/migration.sql`, 'utf8');
}

/** For each function, the definition in the LATEST migration that defines it (a later CREATE OR REPLACE wins). */
export function latestMigrationFunctions(): Map<string, string> {
  const latest = new Map<string, string>();
  for (const folder of migrationFolders()) {
    for (const [name, statement] of functionsIn(migrationSql(folder))) latest.set(name, statement);
  }
  return latest;
}

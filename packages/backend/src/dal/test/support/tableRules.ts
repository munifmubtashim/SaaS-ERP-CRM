import { readFileSync } from 'node:fs';
import type { DbClient } from '../../config/db.js';
import { DAL_DIR, migrationFolders, migrationSql } from '../sqlFunctions.js';

/** The rules every tenant table follows (ADR 0008, ADR 0009), as queries a test can assert on. */

/** Whether RLS is enabled and forced on `table`. */
export async function rlsState(
  owner: DbClient,
  table: string,
): Promise<{ enabled: boolean; forced: boolean }[]> {
  return owner.$queryRaw<{ enabled: boolean; forced: boolean }[]>`
    SELECT relrowsecurity AS enabled, relforcerowsecurity AS forced FROM pg_class
    WHERE relname = ${table} AND relnamespace = 'public'::regnamespace`;
}

/** Every policy on `table`: its command and the roles it names. */
export async function policies(owner: DbClient, table: string): Promise<{ cmd: string; roles: string[] }[]> {
  return owner.$queryRaw<{ cmd: string; roles: string[] }[]>`
    SELECT cmd, roles::text[] AS roles FROM pg_policies WHERE tablename = ${table}`;
}

/** The privileges `role` holds on `table`, table-level only (column grants are checked by trying them). */
export async function tablePrivileges(owner: DbClient, table: string, role: string): Promise<string[]> {
  const rows = await owner.$queryRaw<{ privilege: string }[]>`
    SELECT privilege_type AS privilege FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = ${table} AND grantee = ${role}
    ORDER BY privilege_type`;
  return rows.map((row) => row.privilege);
}

const normalise = (sql: string) =>
  sql
    .replace(/--[^\n]*/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Whether dal/<file> appears, unchanged apart from comments and spacing, in the migration named `<suffix>`. */
export function sourceIsInMigration(file: string, suffix: string): boolean {
  const folder = migrationFolders().find((name) => name.endsWith(`_${suffix}`));
  if (!folder) throw new Error(`no migration ends with _${suffix}`);
  return normalise(migrationSql(folder)).includes(normalise(readFileSync(`${DAL_DIR}${file}`, 'utf8')));
}

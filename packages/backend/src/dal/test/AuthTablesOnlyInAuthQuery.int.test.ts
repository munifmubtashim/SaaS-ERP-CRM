import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DAL_DIR } from './sqlFunctions.js';

/**
 * ADR 0008 test 15, with no database: app_user, role, role_permission and user_scope have no tenant RLS, so only
 * AuthQuery may read or write them, always filtered by organization or by the user's own id.
 *
 * 1. No dal source file other than query/AuthQuery.ts names those tables, their Prisma models or the back-relation
 *    fields Prisma requires on Organization, Business and Branch. The migration source files that create them
 *    (sql/rls/auth_access.sql, sql/triggers/user_scope.sql) are the only other exceptions.
 * 2. No schema file other than auth.prisma declares a relation to those models, except the list back-relations
 *    in organization.prisma named in BACK_RELATIONS (Prisma refuses a foreign key without them).
 */
const AUTH_QUERY = 'query/AuthQuery.ts';
const DEFINITIONS = ['sql/rls/auth_access.sql', 'sql/triggers/user_scope.sql'];
const BACK_RELATIONS = ['appUsers', 'authRoles', 'userScopes'];

const FORBIDDEN = new RegExp(
  [
    String.raw`\bapp_user\b`,
    String.raw`\brole_permission\b`,
    String.raw`\buser_scope\b`,
    // The role table, as SQL names it (the word "role" alone is too common to ban).
    String.raw`\b(?:FROM|JOIN|INTO|UPDATE|TABLE)\s+(?:public\.)?"?role"?\b`,
    String.raw`\b(?:AppUser|RolePermission|UserScope)\b`,
    // Prisma client accessors: db.appUser, tx.role, db.rolePermission, db.userScope.
    String.raw`\.(?:appUser|role|rolePermission|userScope)\s*\.`,
    ...BACK_RELATIONS.map((name) => String.raw`\b${name}\b`),
  ].join('|'),
  'i',
);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return ['node_modules', 'test', 'migrations', 'generated'].includes(entry.name)
        ? []
        : sourceFiles(path);
    }
    return /\.(ts|sql)$/.test(entry.name) ? [path] : [];
  });
}

describe('ADR 0008 test 15: only AuthQuery touches the access tables', () => {
  it('no dal source file other than AuthQuery.ts names app_user, role, role_permission or user_scope', () => {
    const offenders = sourceFiles(DAL_DIR)
      .map((path) => relative(DAL_DIR, path))
      .filter((file) => file !== AUTH_QUERY && !DEFINITIONS.includes(file))
      .filter((file) => FORBIDDEN.test(readFileSync(join(DAL_DIR, file), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('no schema file other than auth.prisma relates to the auth models, except the named back-relations', () => {
    const schemaDir = join(DAL_DIR, 'prisma/schema');
    const offenders: string[] = [];
    for (const file of readdirSync(schemaDir).filter(
      (name) => name.endsWith('.prisma') && name !== 'auth.prisma',
    )) {
      for (const line of readFileSync(join(schemaDir, file), 'utf8').split('\n')) {
        const field = /^\s*(\w+)\s+(AppUser|Role|RolePermission|UserScope)(\[\]|\?)?(\s|$)/.exec(line);
        if (!field) continue;
        const [, name = '', , list] = field;
        const allowed = file === 'organization.prisma' && list === '[]' && BACK_RELATIONS.includes(name);
        if (!allowed) offenders.push(`${file}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the check itself catches a Query that names an auth table', () => {
    expect(FORBIDDEN.test('await tx.$queryRaw`SELECT * FROM app_user`')).toBe(true);
    expect(FORBIDDEN.test('SELECT 1 FROM public.role r')).toBe(true);
    expect(FORBIDDEN.test('db.userScope.findMany()')).toBe(true);
    expect(FORBIDDEN.test('include: { userScopes: true }')).toBe(true);
    expect(FORBIDDEN.test('// runs as the erp_app role')).toBe(false);
  });
});

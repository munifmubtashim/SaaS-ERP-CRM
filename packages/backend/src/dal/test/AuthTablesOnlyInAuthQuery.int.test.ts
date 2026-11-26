import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DAL_DIR } from './sqlFunctions.js';

/**
 * ADR 0008 test 15 (extended to auth_session by ADR 0018 test 12), with no database: app_user, role, role_permission,
 * user_scope and auth_session are read before a tenant scope exists (ADR 0050), so only
 * AuthQuery may read or write them, always filtered by organization or by the user's own id.
 *
 * 1. No dal source file other than query/AuthQuery.ts names those tables, their Prisma models or the back-relation
 *    fields Prisma requires on Organization, Business and Branch. The migration source files that create them
 *    (sql/rls/auth_access.sql, sql/triggers/user_scope.sql) are the only other exceptions.
 * 2. No schema file other than auth.prisma declares a relation to those models, except the list back-relations
 *    in organization.prisma named in BACK_RELATIONS (Prisma refuses a foreign key without them) and the foreign
 *    keys named in NAMED_RELATIONS.
 */
const AUTH_QUERY = 'query/AuthQuery.ts';
const DEFINITIONS = [
  'sql/rls/auth_access.sql',
  'sql/triggers/user_scope.sql',
  'sql/rls/auth_session.sql',
  // The "me" policies on business and branch read the caller's own user_scope rows (ADR 0060).
  'sql/rls/me_businesses.sql',
  // The seed (ADR 0009 part 4) writes roles and their permissions as the migration owner, outside any request.
  'prisma/seeds/systemRoles.ts',
  // The demo organization seed writes the owner user and its group scope, as the migration owner.
  'prisma/seeds/demoOrganization.ts',
];
const BACK_RELATIONS = ['appUsers', 'authRoles', 'userScopes', 'authSessions'];
/**
 * Named exceptions to rule 2: a foreign key from another table to an auth model. Each one is a column that names a
 * user, nothing more; no Query may follow it into the auth table (rule 1 still applies to every source file).
 * idempotency_key.user_id (ADR 0011 section 4, Munif 22 Nov): a retry by another user is refused.
 */
const NAMED_RELATIONS = [{ file: 'platform.prisma', field: 'user', model: 'AppUser' }];

const FORBIDDEN = new RegExp(
  [
    String.raw`\bapp_user\b`,
    String.raw`\brole_permission\b`,
    String.raw`\buser_scope\b`,
    String.raw`\bauth_session\b`,
    // The role table, as SQL names it (the word "role" alone is too common to ban).
    String.raw`\b(?:FROM|JOIN|INTO|UPDATE|TABLE)\s+(?:public\.)?"?role"?\b`,
    String.raw`\b(?:AppUser|RolePermission|UserScope|AuthSession)\b`,
    // Prisma client accessors: db.appUser, tx.role, db.rolePermission, db.userScope.
    String.raw`\.(?:appUser|role|rolePermission|userScope|authSession)\s*\.`,
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
        const field = /^\s*(\w+)\s+(AppUser|Role|RolePermission|UserScope|AuthSession)(\[\]|\?)?(\s|$)/.exec(
          line,
        );
        if (!field) continue;
        const [, name = '', model = '', list] = field;
        const named = NAMED_RELATIONS.some(
          (relation) => relation.file === file && relation.field === name && relation.model === model,
        );
        const allowed =
          named || (file === 'organization.prisma' && list === '[]' && BACK_RELATIONS.includes(name));
        if (!allowed) offenders.push(`${file}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the check itself catches a Query that names an auth table', () => {
    expect(FORBIDDEN.test('await tx.$queryRaw`SELECT * FROM app_user`')).toBe(true);
    expect(FORBIDDEN.test('SELECT 1 FROM public.role r')).toBe(true);
    expect(FORBIDDEN.test('db.userScope.findMany()')).toBe(true);
    expect(FORBIDDEN.test('UPDATE auth_session SET revoked_at = now()')).toBe(true);
    expect(FORBIDDEN.test('tx.authSession.findFirst()')).toBe(true);
    expect(FORBIDDEN.test('include: { userScopes: true }')).toBe(true);
    expect(FORBIDDEN.test('// runs as the erp_app role')).toBe(false);
  });
});

import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// ADR 0005: only AuthQuery and HealthQuery may run without a tenant scope. The lint rule enforces it;
// this test proves the rule fires. No database needed; it lives here because dal has only this suite.
const root = fileURLToPath(new URL('../../../../../', import.meta.url));
const eslint = new ESLint({ cwd: root });
const source = `import { UnscopedQuery } from './UnscopedQuery.js';\n\nexport class X extends UnscopedQuery {}\n`;

async function restrictedImports(file: string): Promise<string[]> {
  const [result] = await eslint.lintText(source, {
    filePath: `${root}packages/backend/src/dal/query/${file}`,
  });
  return (result?.messages ?? [])
    .filter((m) => m.ruleId === '@typescript-eslint/no-restricted-imports')
    .map((m) => m.message);
}

describe('UnscopedQuery is reserved for AuthQuery and HealthQuery (lint rule)', () => {
  it('fails lint when a tenant Query imports UnscopedQuery', async () => {
    expect(await restrictedImports('OrganizationQuery.ts')).toEqual([expect.stringMatching(/ADR 0005/)]);
  });

  it.each(['AuthQuery.ts', 'HealthQuery.ts'])('allows %s to import it', async (file) => {
    expect(await restrictedImports(file)).toEqual([]);
  });
});

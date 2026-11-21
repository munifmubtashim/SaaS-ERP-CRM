import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// CLAUDE.md: Queries are constructed only in createManagers. ADR 0010's factory is the one exception: it lives in
// dal/query/ProvisioningQuery.ts so the provisioner client never leaves dal. This proves the exception covers
// that file only, and that the file keeps the other code-standard rules. No database needed.
const root = fileURLToPath(new URL('../../../../../', import.meta.url));
const eslint = new ESLint({ cwd: root });

async function syntaxErrors(path: string, source: string): Promise<string[]> {
  const [result] = await eslint.lintText(source, { filePath: `${root}packages/backend/src/${path}` });
  return (result?.messages ?? []).filter((m) => m.ruleId === 'no-restricted-syntax').map((m) => m.message);
}

const constructsQuery = `class SomeQuery {}\n\nexport const make = (): SomeQuery => new SomeQuery();\n`;

describe('constructing a Query outside createManagers (no-restricted-syntax)', () => {
  it('is allowed in dal/query/ProvisioningQuery.ts (ADR 0010 factory)', async () => {
    expect(await syntaxErrors('dal/query/ProvisioningQuery.ts', constructsQuery)).toEqual([]);
  });

  it.each(['dal/query/OrganizationQuery.ts', 'dal/config/provisionerDb.ts', 'dal/dto/OrganizationDTO.ts'])(
    'still fails in %s',
    async (path) => {
      expect(await syntaxErrors(path, constructsQuery)).toEqual([expect.stringMatching(/createManagers/)]);
    },
  );

  it('ProvisioningQuery.ts still may not construct a Controller or throw "not supported"', async () => {
    const source = `class AController {}\nexport const c = new AController();\nexport function f(): never {\n  throw new Error('not supported');\n}\n`;
    expect(await syntaxErrors('dal/query/ProvisioningQuery.ts', source)).toHaveLength(2);
  });
});

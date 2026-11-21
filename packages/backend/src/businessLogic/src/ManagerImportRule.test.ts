import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

/**
 * ADR 0012 test 4: a Manager depends on other modules only through published interfaces
 * (contracts/provided/*), never on another module's Manager, service class or Query. No database needed.
 */
const root = fileURLToPath(new URL('../../../../../', import.meta.url));
const eslint = new ESLint({ cwd: root });

async function importErrors(path: string, source: string): Promise<string[]> {
  const [result] = await eslint.lintText(source, {
    filePath: `${root}packages/backend/src/businessLogic/src/${path}`,
  });
  return (result?.messages ?? [])
    .filter((m) => m.ruleId === '@typescript-eslint/no-restricted-imports')
    .map((m) => m.message);
}

describe('a Manager may not import another module (ADR 0012 test 4)', () => {
  it.each([
    [
      "import { SalesManager } from './SalesManager.js';\nexport const x = SalesManager;\n",
      'another Manager',
    ],
    [
      "import type { SalesManager } from './SalesManager.js';\nexport type X = SalesManager;\n",
      'another Manager, as a type',
    ],
    [
      "import { PostingService } from './PostingService.js';\nexport const x = PostingService;\n",
      'a service class',
    ],
    ["import { SalesQuery } from '@erp/dal';\nexport const x = SalesQuery;\n", "another module's Query"],
  ])('%s fails lint (%s)', async (source) => {
    expect(await importErrors('PartyManager.ts', source)).not.toEqual([]);
  });

  it('a published interface is allowed', async () => {
    const source =
      "import type { IPostingService } from './contracts/provided/IPostingService.js';\nexport type X = IPostingService;\n";
    expect(await importErrors('PartyManager.ts', source)).toEqual([]);
  });
});

describe('the rule covers all of businessLogic/src, not only Managers (review finding, #97)', () => {
  const importsManager =
    "import { SalesManager } from './SalesManager.js';\nexport const x = SalesManager;\n";
  const importsService =
    "import { PostingService } from './PostingService.js';\nexport const x = PostingService;\n";

  it.each(['SalesPaymentRecorder.ts', 'IdempotencyGuard.ts', 'NumberSeries.ts', 'test/FakeStockService.ts'])(
    '%s may not import a Manager or a service class',
    async (path) => {
      expect(await importErrors(path, importsManager)).not.toEqual([]);
      expect(await importErrors(path, importsService)).not.toEqual([]);
    },
  );

  it('the composition root (index.ts) and test files may', async () => {
    expect(await importErrors('index.ts', importsManager)).toEqual([]);
    expect(await importErrors('AuthManager.test.ts', importsManager)).toEqual([]);
  });
});

import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * ADR 0012 test 4: a Manager depends on other modules only through published interfaces
 * (contracts/provided/*), never on another module's Manager, service class or Query. No database needed.
 * The rule is an allowlist (Farhan, #97): inside businessLogic/src a relative import may reach only
 * ./contracts/** and the JournalDraftRules helper, so a class whose name doesn't end in Manager or Service
 * (NumberSeries, SalesPaymentRecorder, IdempotencyGuard) is covered too.
 */
const root = fileURLToPath(new URL('../../../../../', import.meta.url));
let eslint: ESLint;

// Building ESLint loads the whole flat config; under parallel load (turbo runs lint, typecheck and test together)
// that can take longer than vitest's 5 s default, so it is built once, with room to spare (Farhan, #97).
beforeAll(() => {
  eslint = new ESLint({ cwd: root });
}, 30_000);

async function importErrors(path: string, source: string): Promise<string[]> {
  const [result] = await eslint.lintText(source, {
    filePath: `${root}packages/backend/src/businessLogic/src/${path}`,
  });
  return (result?.messages ?? [])
    .filter((m) => m.ruleId === '@typescript-eslint/no-restricted-imports')
    .map((m) => m.message);
}

const importOf = (name: string, from: string) =>
  `import { ${name} } from '${from}';\nexport const x = ${name};\n`;

describe('a Manager may not import another module (ADR 0012 test 4)', { timeout: 30_000 }, () => {
  it.each([
    [importOf('SalesManager', './SalesManager.js'), 'another Manager'],
    [
      "import type { SalesManager } from './SalesManager.js';\nexport type X = SalesManager;\n",
      'another Manager, as a type',
    ],
    [importOf('PostingService', './PostingService.js'), 'a service class'],
    [importOf('NumberSeries', './NumberSeries.js'), 'a class not named Manager or Service (NumberSeries)'],
    [importOf('SalesPaymentRecorder', './SalesPaymentRecorder.js'), 'SalesPaymentRecorder'],
    [importOf('IdempotencyGuard', './IdempotencyGuard.js'), 'IdempotencyGuard'],
    [
      "import type { NumberSeries } from './NumberSeries.js';\nexport type X = NumberSeries;\n",
      'NumberSeries, as a type',
    ],
    [importOf('SalesQuery', '@erp/dal'), "another module's Query"],
  ])('%s fails lint (%s)', async (source) => {
    expect(await importErrors('PartyManager.ts', source)).not.toEqual([]);
  });

  it.each([
    [
      "import type { IPostingService } from './contracts/provided/IPostingService.js';\nexport type X = IPostingService;\n",
      'a published interface',
    ],
    [
      "import type { IPartyQuery } from './contracts/IPartyQuery.js';\nexport type X = IPartyQuery;\n",
      "the module's own Query contract",
    ],
    ["import { AppError } from '@erp/shared';\nexport const x = AppError;\n", '@erp/shared'],
  ])('%s is allowed (%s)', async (source) => {
    expect(await importErrors('PartyManager.ts', source)).toEqual([]);
  });
});

describe(
  'the rule covers all of businessLogic/src, not only Managers (review finding, #97)',
  { timeout: 30_000 },
  () => {
    const importsManager = importOf('SalesManager', './SalesManager.js');
    const importsService = importOf('PostingService', './PostingService.js');
    const importsNumberSeries = importOf('NumberSeries', './NumberSeries.js');

    it.each([
      'SalesPaymentRecorder.ts',
      'IdempotencyGuard.ts',
      'NumberSeries.ts',
      'test/FakeStockService.ts',
    ])('%s may not import a Manager, a service class or another class', async (path) => {
      expect(await importErrors(path, importsManager)).not.toEqual([]);
      expect(await importErrors(path, importsService)).not.toEqual([]);
      expect(await importErrors(path.replace('NumberSeries', 'Other'), importsNumberSeries)).not.toEqual([]);
    });

    it('the fakes in test/ may reach the contracts and the JournalDraftRules helper', async () => {
      expect(
        await importErrors(
          'test/FakePostingService.ts',
          "import { assertBalancedDraft } from '../JournalDraftRules.js';\nimport type { IPostingService } from '../contracts/provided/IPostingService.js';\nexport const x = assertBalancedDraft;\nexport type X = IPostingService;\n",
        ),
      ).toEqual([]);
    });

    it('the composition root (index.ts) and test files may import classes', async () => {
      expect(await importErrors('index.ts', importsManager)).toEqual([]);
      expect(await importErrors('AuthManager.test.ts', importsManager)).toEqual([]);
      expect(await importErrors('AuthManager.test.ts', importsNumberSeries)).toEqual([]);
    });
  },
);

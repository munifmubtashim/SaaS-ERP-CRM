import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// ADR 0005 named exception (amended by ADR 0008): ProvisioningQuery is the only code that connects as
// erp_provisioner, through dal/config/provisionerDb. The lint rule enforces it; this test proves the rule fires,
// and that combining it with the UnscopedQuery rule did not weaken that one. No database needed.
const root = fileURLToPath(new URL('../../../../../', import.meta.url));
const eslint = new ESLint({ cwd: root });

async function restrictedImports(file: string, source: string): Promise<string[]> {
  const [result] = await eslint.lintText(source, {
    filePath: `${root}packages/backend/src/dal/query/${file}`,
  });
  return (result?.messages ?? [])
    .filter((m) => m.ruleId === '@typescript-eslint/no-restricted-imports')
    .map((m) => m.message);
}

const importsProvisioner = `import { createProvisionerClient } from '../config/provisionerDb.js';\n\nexport const c = createProvisionerClient;\n`;
const importsUnscoped = `import { UnscopedQuery } from './UnscopedQuery.js';\n\nexport class X extends UnscopedQuery {}\n`;

describe('the erp_provisioner connection is reserved for ProvisioningQuery (lint rule)', () => {
  it('allows ProvisioningQuery to import it', async () => {
    expect(await restrictedImports('ProvisioningQuery.ts', importsProvisioner)).toEqual([]);
  });

  it.each(['OrganizationQuery.ts', 'AuthQuery.ts', 'HealthQuery.ts'])(
    'fails lint when %s imports it',
    async (file) => {
      expect(await restrictedImports(file, importsProvisioner)).toEqual([expect.stringMatching(/ADR 0008/)]);
    },
  );

  it('still fails lint when ProvisioningQuery imports UnscopedQuery', async () => {
    expect(await restrictedImports('ProvisioningQuery.ts', importsUnscoped)).toEqual([
      expect.stringMatching(/ADR 0005/),
    ]);
  });

  it('still lets AuthQuery and HealthQuery import UnscopedQuery', async () => {
    expect(await restrictedImports('AuthQuery.ts', importsUnscoped)).toEqual([]);
    expect(await restrictedImports('HealthQuery.ts', importsUnscoped)).toEqual([]);
  });
});

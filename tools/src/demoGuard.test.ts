import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { assertDemoTarget, DEMO4, demoTargetProblems } from './demoGuard.ts';

/**
 * demo:reset's guard (Munif, 24 Nov): it deletes and rebuilds a database, so it refuses, loudly, unless every part
 * of the target is the demo4 one: container erp-pg-demo4, port 55444, volume erp_demo4-data, database erp_demo4.
 * The everyday local database (compose project "erp": erp-postgres-1, 5433, erp_postgres-data, erp) is refused.
 */
const EVERYDAY = { container: 'erp-postgres-1', port: '5433', volume: 'erp_postgres-data', database: 'erp' };
const CLI = fileURLToPath(new URL('../scripts/demoGuard.ts', import.meta.url));
const RESET = fileURLToPath(new URL('../scripts/demo-reset.sh', import.meta.url));

describe('the demo:reset guard', () => {
  it('refuses the everyday local database, naming every part that is wrong', () => {
    expect(demoTargetProblems(EVERYDAY)).toEqual([
      'container is "erp-postgres-1", not "erp-pg-demo4"',
      'port is "5433", not "55444"',
      'volume is "erp_postgres-data", not "erp_demo4-data"',
      'database is "erp", not "erp_demo4"',
    ]);
    expect(() => assertDemoTarget(EVERYDAY)).toThrow(/refuses.*erp-postgres-1/s);
  });

  it.each([
    ['the everyday container', { container: 'erp-postgres-1' }],
    ['the everyday port', { port: '5433' }],
    ['the everyday volume', { volume: 'erp_postgres-data' }],
    ['the everyday database name', { database: 'erp' }],
  ])('refuses the demo4 target with %s', (_case, change) => {
    expect(() => assertDemoTarget({ ...DEMO4, ...change })).toThrow(/demo:reset refuses/);
  });

  it('allows exactly the demo4 target', () => {
    expect(demoTargetProblems(DEMO4)).toEqual([]);
    expect(() => assertDemoTarget(DEMO4)).not.toThrow();
  });

  it('the command line exits 1 against the everyday database and says why; 0 for demo4', () => {
    const everyday = spawnSync(process.execPath, [CLI, ...Object.values(EVERYDAY)], { encoding: 'utf8' });
    expect(everyday.status).toBe(1);
    expect(everyday.stderr).toMatch(/demo:reset refuses/);
    const demo4 = spawnSync(process.execPath, [CLI, ...Object.values(DEMO4)], { encoding: 'utf8' });
    expect(demo4.status).toBe(0);
  });

  it('demo-reset.sh runs the guard before any docker command, and stops if it fails (set -e)', () => {
    const lines = readFileSync(RESET, 'utf8').split('\n');
    const guard = lines.findIndex((l) => l.includes('tools/scripts/demoGuard.ts'));
    const docker = lines.findIndex((l) => /^\s*docker /.test(l));
    expect(lines).toContain('set -eu');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(docker);
  });
});

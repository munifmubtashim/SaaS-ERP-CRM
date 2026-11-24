import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  assertDemoTarget,
  DEMO4,
  demoTargetProblems,
  demoUrlProblems,
  ownerConfProblems,
} from './demoGuard.ts';

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

describe('the seed and demo:start guards (Munif, 25 Nov)', () => {
  const SEED = fileURLToPath(new URL('../scripts/demo-seed.sh', import.meta.url));
  const URL_CLI = fileURLToPath(new URL('../scripts/demoGuardUrl.ts', import.meta.url));
  const OWNER_CLI = fileURLToPath(new URL('../scripts/demoOwnerCheck.ts', import.meta.url));
  const secret = 'not-a-real-secret-123';

  it('a database URL must be erp_demo4 on 127.0.0.1:55444; the everyday one is refused; no password is ever shown', () => {
    expect(demoUrlProblems(`postgresql://erp_owner:${secret}@127.0.0.1:55444/erp_demo4`)).toEqual([]);
    const everyday = demoUrlProblems(`postgresql://erp_owner:${secret}@localhost:5433/erp`);
    expect(everyday).toEqual(['port is "5433", not "55444"', 'database is "erp", not "erp_demo4"']);
    expect(demoUrlProblems(`postgresql://erp_owner:${secret}@db.example.com:55444/erp_demo4`)).toEqual([
      'host is "db.example.com", not 127.0.0.1 or localhost',
    ]);
    expect(demoUrlProblems('not a url')).toEqual(['not a database URL']);
    expect(JSON.stringify(everyday)).not.toContain(secret);
  });

  it('the URL guard reads the URL from the environment by name, exits 1 on the everyday one, and never prints it', () => {
    const run = (url: string) =>
      spawnSync(process.execPath, [URL_CLI, 'MIGRATION_DATABASE_URL'], {
        encoding: 'utf8',
        env: { ...process.env, MIGRATION_DATABASE_URL: url },
      });
    const refused = run(`postgresql://erp_owner:${secret}@localhost:5433/erp`);
    expect(refused.status).toBe(1);
    expect(refused.stderr).toMatch(/refuses/);
    expect(refused.stderr + refused.stdout).not.toContain(secret);
    expect(run(`postgresql://erp_owner:${secret}@127.0.0.1:55444/erp_demo4`).status).toBe(0);
    const unset = spawnSync(process.execPath, [URL_CLI, 'NO_SUCH_VARIABLE'], { encoding: 'utf8' });
    expect(unset.status).toBe(1);
    expect(unset.stderr).toMatch(/NO_SUCH_VARIABLE is not set/);
  });

  it('owner.conf must hold both variables with a value; only the missing names are reported, never a value', () => {
    expect(ownerConfProblems(`DEMO_OWNER_EMAIL=a@example.com\nDEMO_OWNER_PASSWORD=${secret}\n`)).toEqual([]);
    expect(ownerConfProblems(`DEMO_OWNER_EMAIL=\nDEMO_OWNER_PASSWORD=${secret}\n`)).toEqual([
      'DEMO_OWNER_EMAIL is missing or empty',
    ]);
    expect(ownerConfProblems('')).toEqual([
      'DEMO_OWNER_EMAIL is missing or empty',
      'DEMO_OWNER_PASSWORD is missing or empty',
    ]);
    const missing = spawnSync(process.execPath, [OWNER_CLI, '/no/such/owner.conf'], { encoding: 'utf8' });
    expect(missing.status).toBe(1);
    expect(missing.stderr).toMatch(/owner\.conf not found/);
  });

  it('demo-seed.sh loads owner.conf and the demo4 settings only, never the root settings file, and guards first', () => {
    const script = readFileSync(SEED, 'utf8');
    expect(script).not.toMatch(/env-file/);
    expect(script).toMatch(/unset DEMO_OWNER_EMAIL DEMO_OWNER_PASSWORD/);
    expect(script).toContain('. ./.demo/owner.conf');
    const lines = script.split('\n');
    const guard = lines.findIndex((l) => l.includes('demoGuardUrl.ts'));
    const seed = lines.findIndex((l) => l.includes('seedDemo.ts'));
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(seed);
  });
});

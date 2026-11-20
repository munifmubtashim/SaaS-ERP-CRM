/**
 * CI audit gate: `npm audit --json`, then fail on every high or critical advisory except a time-limited,
 * path-limited exception in tools/audit-allowlist.json (rules in ../src/auditAllowlist.ts).
 *
 *   node tools/scripts/checkAudit.ts [--allowlist <file>]
 *
 * Runs with plain Node (type stripping) and no npm ci: npm audit reads package-lock.json only.
 * Exit 0 = pass, 1 = fail or unreadable input.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  AuditInputError,
  dependentsInLockfile,
  evaluateAudit,
  parseAllowlist,
  parseAuditReport,
} from '../src/auditAllowlist.ts';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

function allowlistPath(): string {
  const index = process.argv.indexOf('--allowlist');
  if (index === -1) return fileURLToPath(new URL('../audit-allowlist.json', import.meta.url));
  const value = process.argv[index + 1];
  if (!value) throw new AuditInputError('--allowlist needs a file path');
  return value;
}

function runNpmAudit(): string {
  // npm audit exits 1 whenever it finds anything, so the exit code is not the verdict; the JSON is.
  const result = spawnSync('npm', ['audit', '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw new AuditInputError(`could not run npm audit: ${result.error.message}`);
  if (!result.stdout.trim())
    throw new AuditInputError(`npm audit printed nothing (exit ${result.status}): ${result.stderr}`);
  return result.stdout;
}

function main(): number {
  const allowlist = parseAllowlist(readFileSync(allowlistPath(), 'utf8'));
  // Built from import.meta.url, which is already a valid file URL, so a '#' or '%' in the checkout path is safe.
  const lockfile = readFileSync(new URL('../../package-lock.json', import.meta.url), 'utf8');
  const advisories = parseAuditReport(runNpmAudit());
  const today = new Date().toISOString().slice(0, 10);

  const result = evaluateAudit({
    advisories,
    allowlist,
    dependents: (pkg) => dependentsInLockfile(lockfile, pkg),
    today,
  });

  const below = advisories.filter((a) => a.severity !== 'high' && a.severity !== 'critical').length;
  console.log(
    `npm audit: ${advisories.length} advisories; ${below} below high are not gated (as with --audit-level=high).`,
  );
  for (const { advisory, entry } of result.ignored) {
    console.log(
      `IGNORED ${advisory.severity} ${advisory.id} in ${advisory.package} (only via ${entry.path}). ` +
        `Exception expires ${entry.expires}, owner ${entry.owner}. ${advisory.url}`,
    );
  }
  for (const warning of result.warnings) console.warn(`WARN ${warning}`);
  for (const failure of result.failures) console.error(`FAIL ${failure.message}`);

  console.log(result.ok ? 'Audit gate passed.' : `Audit gate failed: ${result.failures.length} problem(s).`);
  return result.ok ? 0 : 1;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

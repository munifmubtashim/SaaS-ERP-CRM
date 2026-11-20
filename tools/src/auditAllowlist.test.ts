import { describe, expect, it } from 'vitest';
import {
  AuditInputError,
  dependentsInLockfile,
  evaluateAudit,
  MAX_EXPIRY_DAYS,
  parseAllowlist,
  parseAuditReport,
  type AllowlistEntry,
} from './auditAllowlist.ts';

const TODAY = '2026-11-20';

const effectAdvisory = {
  source: 1248071,
  name: 'effect',
  dependency: 'effect',
  title: 'Effect: ReDoS in Schema.TemplateLiteral compiled regex',
  url: 'https://github.com/advisories/GHSA-7589-6fvf-x4pw',
  severity: 'high',
  range: '<=3.22.0',
};

// The shape `npm audit --json` (npm 11) printed for this repo on 20 Nov 2026, trimmed to what the gate reads.
function report(extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    auditReportVersion: 2,
    vulnerabilities: {
      effect: {
        name: 'effect',
        severity: 'high',
        via: [effectAdvisory],
        effects: ['@prisma/config'],
        nodes: ['node_modules/effect'],
      },
      '@prisma/config': {
        name: '@prisma/config',
        severity: 'high',
        via: ['effect'],
        effects: ['prisma'],
        nodes: ['node_modules/@prisma/config'],
      },
      prisma: {
        name: 'prisma',
        severity: 'high',
        via: ['@prisma/config'],
        effects: [],
        nodes: ['node_modules/prisma'],
      },
      ...extra,
    },
    metadata: {},
  });
}

const entry: AllowlistEntry = {
  id: 'GHSA-7589-6fvf-x4pw',
  package: 'effect',
  path: '@prisma/config',
  reason: 'test',
  expires: '2026-12-20',
  owner: 'dev-munif',
};

const onlyPrismaConfig = (pkg: string) => (pkg === 'effect' ? ['@prisma/config'] : []);

function run(raw: string, allowlist: AllowlistEntry[], dependents = onlyPrismaConfig, today = TODAY) {
  return evaluateAudit({ advisories: parseAuditReport(raw), allowlist, dependents, today });
}

describe('evaluateAudit', () => {
  it('passes an allowlisted advisory that is in date and only under @prisma/config', () => {
    const result = run(report(), [entry]);
    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.ignored).toHaveLength(1);
    expect(result.ignored[0]?.advisory.id).toBe('GHSA-7589-6fvf-x4pw');
    expect(result.ignored[0]?.entry.expires).toBe('2026-12-20');
  });

  it('still passes on the expiry day itself', () => {
    expect(run(report(), [entry], onlyPrismaConfig, '2026-12-20').ok).toBe(true);
  });

  it('fails on another high advisory', () => {
    const other = {
      lodash: {
        name: 'lodash',
        severity: 'high',
        via: [
          { ...effectAdvisory, name: 'lodash', url: 'https://github.com/advisories/GHSA-2345-6789-cfgh' },
        ],
        effects: [],
        nodes: ['node_modules/lodash'],
      },
    };
    const result = run(report(other), [entry]);
    expect(result.ok).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.message).toContain('GHSA-2345-6789-cfgh');
  });

  it('fails on a critical advisory', () => {
    const crit = {
      pkg: {
        name: 'pkg',
        severity: 'critical',
        via: [
          {
            ...effectAdvisory,
            name: 'pkg',
            severity: 'critical',
            url: 'https://github.com/advisories/GHSA-jmpq-rvwx-2345',
          },
        ],
        effects: [],
        nodes: ['node_modules/pkg'],
      },
    };
    expect(run(report(crit), [entry]).ok).toBe(false);
  });

  it('fails when the allowlist entry has expired', () => {
    const result = run(report(), [{ ...entry, expires: '2026-11-19' }]);
    expect(result.ok).toBe(false);
    expect(result.ignored).toEqual([]);
    expect(result.failures.map((f) => f.message).join(' ')).toContain('expired');
  });

  it('fails on an expired entry even when its advisory is gone', () => {
    const clean = JSON.stringify({ auditReportVersion: 2, vulnerabilities: {}, metadata: {} });
    expect(run(clean, [{ ...entry, expires: '2026-01-01' }]).ok).toBe(false);
  });

  it('caps the expiry at 30 days after today', () => {
    expect(MAX_EXPIRY_DAYS).toBe(30);
  });

  it('passes an entry that expires exactly 30 days after today', () => {
    // TODAY is 2026-11-20; +30 days is 2026-12-20.
    const result = run(report(), [{ ...entry, expires: '2026-12-20' }]);
    expect(result.ok).toBe(true);
    expect(result.ignored).toHaveLength(1);
  });

  it('fails an entry that expires 31 days after today', () => {
    const result = run(report(), [{ ...entry, expires: '2026-12-21' }]);
    expect(result.ok).toBe(false);
    expect(result.ignored).toEqual([]);
    expect(result.failures.map((f) => f.message)).toContain(
      'allowlist entry GHSA-7589-6fvf-x4pw (effect) expires 2026-12-21, more than 30 days after today',
    );
  });

  it('warns, but does not fail, for an in-date entry that matches no advisory', () => {
    const clean = JSON.stringify({ auditReportVersion: 2, vulnerabilities: {}, metadata: {} });
    const result = run(clean, [entry]);
    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('GHSA-7589-6fvf-x4pw');
  });

  it('gives no warning when every entry matches an advisory', () => {
    expect(run(report(), [entry]).warnings).toEqual([]);
  });

  it('fails when the allowlisted id is reached through another path', () => {
    const alsoRuntime = (pkg: string) => (pkg === 'effect' ? ['@prisma/config', 'some-runtime-lib'] : []);
    const result = run(report(), [entry], alsoRuntime);
    expect(result.ok).toBe(false);
    expect(result.failures[0]?.message).toContain('some-runtime-lib');
  });

  it('fails when npm reports a dependent outside the allowed path', () => {
    const raw = JSON.parse(report()) as { vulnerabilities: { effect: { effects: string[] } } };
    raw.vulnerabilities.effect.effects = ['@prisma/config', 'other-lib'];
    expect(run(JSON.stringify(raw), [entry]).ok).toBe(false);
  });

  it('fails when the allowlist names the id for another package', () => {
    expect(run(report(), [{ ...entry, package: 'not-effect' }]).ok).toBe(false);
  });

  it('ignores moderate and low findings, as npm audit --audit-level=high does', () => {
    const moderate = {
      minimatch: {
        name: 'minimatch',
        severity: 'moderate',
        via: [
          {
            ...effectAdvisory,
            name: 'minimatch',
            severity: 'moderate',
            url: 'https://github.com/advisories/GHSA-g3hv-75wg-m249',
          },
        ],
        effects: ['@typescript-eslint/typescript-estree'],
        nodes: ['node_modules/minimatch'],
      },
      tiny: {
        name: 'tiny',
        severity: 'low',
        via: [
          {
            ...effectAdvisory,
            name: 'tiny',
            severity: 'low',
            url: 'https://github.com/advisories/GHSA-cfgh-jmpq-rvwx',
          },
        ],
        effects: [],
        nodes: ['node_modules/tiny'],
      },
    };
    const result = run(report(moderate), [entry]);
    expect(result.ok).toBe(true);
    expect(result.ignored).toHaveLength(1);
  });

  it('fails with an empty allowlist', () => {
    expect(run(report(), []).ok).toBe(false);
  });
});

describe('parseAuditReport', () => {
  it('reads advisories from via objects, not from transitive entries', () => {
    const advisories = parseAuditReport(report());
    expect(advisories).toEqual([
      {
        id: 'GHSA-7589-6fvf-x4pw',
        package: 'effect',
        severity: 'high',
        title: effectAdvisory.title,
        url: effectAdvisory.url,
        npmDependents: ['@prisma/config'],
      },
    ]);
  });

  it.each([
    ['not JSON', 'npm ERR! something broke'],
    ['an npm error object', JSON.stringify({ error: { code: 'ENOLOCK', summary: 'no lockfile' } })],
    ['no vulnerabilities object', JSON.stringify({ auditReportVersion: 2 })],
    [
      'an unknown severity',
      report({ x: { name: 'x', severity: 'severe', via: [], effects: [], nodes: [] } }),
    ],
    [
      'an advisory without a GHSA url',
      report({
        x: {
          name: 'x',
          severity: 'high',
          via: [{ name: 'x', severity: 'high', url: 'http://example.com' }],
          effects: [],
          nodes: [],
        },
      }),
    ],
    [
      'a transitive entry that points nowhere',
      report({ x: { name: 'x', severity: 'high', via: ['missing-pkg'], effects: [], nodes: [] } }),
    ],
  ])('fails on malformed audit output: %s', (_label, raw) => {
    expect(() => parseAuditReport(raw)).toThrow(AuditInputError);
  });
});

describe('parseAllowlist', () => {
  it('reads valid entries', () => {
    expect(parseAllowlist(JSON.stringify([entry]))).toEqual([entry]);
  });

  it.each([
    ['not an array', JSON.stringify({ entries: [] })],
    ['a bad date', JSON.stringify([{ ...entry, expires: '20 Dec 2026' }])],
    ['an impossible date (31 February)', JSON.stringify([{ ...entry, expires: '2026-02-31' }])],
    ['a missing owner', JSON.stringify([{ ...entry, owner: undefined }])],
    ['a bad id', JSON.stringify([{ ...entry, id: 'CVE-2026-1' }])],
  ])('fails on a malformed allowlist: %s', (_label, raw) => {
    expect(() => parseAllowlist(raw)).toThrow(AuditInputError);
  });
});

describe('dependentsInLockfile', () => {
  it('lists every package that depends on the vulnerable package', () => {
    const lock = {
      packages: {
        '': { name: 'erp', devDependencies: { prisma: '7.10.1' } },
        'node_modules/@prisma/config': { dependencies: { effect: '3.20.0', c12: '3.3.4' } },
        'node_modules/effect': { dependencies: { 'fast-check': '^3.23.1' } },
        'packages/backend/src/dal': { name: '@erp/dal', dependencies: { '@prisma/client': '7.10.1' } },
      },
    };
    expect(dependentsInLockfile(JSON.stringify(lock), 'effect')).toEqual(['@prisma/config']);
  });

  it('names workspace dependents by their package name and sees peer dependencies', () => {
    const lock = {
      packages: {
        'packages/backend/src/dal': { name: '@erp/dal', dependencies: { effect: '3.20.0' } },
        'node_modules/x/node_modules/y': { peerDependencies: { effect: '*' } },
      },
    };
    expect(dependentsInLockfile(JSON.stringify(lock), 'effect')).toEqual(['@erp/dal', 'y']);
  });

  it('fails on a lockfile without packages', () => {
    expect(() => dependentsInLockfile('{}', 'effect')).toThrow(AuditInputError);
  });
});

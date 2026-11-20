/**
 * CI dependency audit with a time-limited allowlist.
 *
 * Same gate as `npm audit --audit-level=high`: every high or critical advisory fails. One exception: an advisory
 * listed in tools/audit-allowlist.json is ignored while its entry is in date AND every package that depends on
 * the vulnerable package is the entry's `path` (for example only `@prisma/config`). An expired entry always
 * fails, so an exception cannot outlive its date. Moderate and low findings are not gated, as before.
 *
 * Pure functions only: scripts/checkAudit.ts runs npm and prints.
 */

export class AuditInputError extends Error {
  override name = 'AuditInputError';
}

const SEVERITIES = ['info', 'low', 'moderate', 'high', 'critical'] as const;
export type Severity = (typeof SEVERITIES)[number];
const GATED: readonly Severity[] = ['high', 'critical'];

const GHSA_ID = /^GHSA(-[23456789cfghjmpqrvwx]{4}){3}$/;
const GHSA_URL = /\/advisories\/(GHSA(?:-[23456789cfghjmpqrvwx]{4}){3})$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface Advisory {
  id: string;
  package: string;
  severity: Severity;
  title: string;
  url: string;
  /** Packages npm lists as affected through this one (`effects` in the audit report). */
  npmDependents: string[];
}

export interface AllowlistEntry {
  id: string;
  package: string;
  /** The only package allowed to depend on `package`, for example `@prisma/config`. */
  path: string;
  reason: string;
  /** Last day (UTC) the exception applies, YYYY-MM-DD. */
  expires: string;
  owner: string;
}

export interface Failure {
  message: string;
}

export interface AuditResult {
  ok: boolean;
  ignored: { advisory: Advisory; entry: AllowlistEntry }[];
  failures: Failure[];
  /** Printed, never fatal: for example an in-date entry whose advisory is no longer reported. */
  warnings: string[];
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

function parseJson(raw: string, what: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new AuditInputError(`${what} is not valid JSON`);
  }
}

/** Reads `npm audit --json` (report version 2). Anything unexpected throws, so a broken run never passes. */
export function parseAuditReport(raw: string): Advisory[] {
  const report = parseJson(raw, 'npm audit output');
  if (!isObject(report)) throw new AuditInputError('npm audit output is not an object');
  if ('error' in report)
    throw new AuditInputError(`npm audit reported an error: ${JSON.stringify(report.error)}`);
  const vulnerabilities = report.vulnerabilities;
  if (!isObject(vulnerabilities))
    throw new AuditInputError('npm audit output has no "vulnerabilities" object');

  const advisories = new Map<string, Advisory>();
  for (const [name, entry] of Object.entries(vulnerabilities)) {
    if (!isObject(entry)) throw new AuditInputError(`audit entry ${name} is not an object`);
    const { severity, via, effects } = entry;
    if (!SEVERITIES.includes(severity as Severity))
      throw new AuditInputError(`audit entry ${name} has severity ${String(severity)}`);
    if (!Array.isArray(via) || !isStringArray(effects))
      throw new AuditInputError(`audit entry ${name} has no via/effects lists`);

    for (const cause of via) {
      if (typeof cause === 'string') {
        // A transitive entry: vulnerable only because `cause` is. The advisory itself is read from `cause`.
        if (!(cause in vulnerabilities))
          throw new AuditInputError(`audit entry ${name} points at missing entry ${cause}`);
        continue;
      }
      if (!isObject(cause)) throw new AuditInputError(`audit entry ${name} has an unreadable advisory`);
      const id = typeof cause.url === 'string' ? GHSA_URL.exec(cause.url)?.[1] : undefined;
      const advisorySeverity = cause.severity as Severity;
      if (!id || !SEVERITIES.includes(advisorySeverity) || typeof cause.title !== 'string') {
        throw new AuditInputError(
          `audit entry ${name} has an advisory without a GHSA url, severity or title`,
        );
      }
      const key = `${id} ${name}`;
      if (!advisories.has(key)) {
        advisories.set(key, {
          id,
          package: name,
          severity: advisorySeverity,
          title: cause.title,
          url: cause.url as string,
          npmDependents: [...effects],
        });
      }
    }
  }
  return [...advisories.values()];
}

/** An entry may expire at most this many days after the day the gate runs (ADR 0002 decision 8). */
export const MAX_EXPIRY_DAYS = 30;

/** True for a real calendar day in YYYY-MM-DD. A round trip rejects dates that Date rolls over (2026-02-31). */
function isRealDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
}

/** `date` (YYYY-MM-DD, UTC) plus `days`, as YYYY-MM-DD. */
function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Reads tools/audit-allowlist.json. Every field is required; a bad entry throws. */
export function parseAllowlist(raw: string): AllowlistEntry[] {
  const list = parseJson(raw, 'audit allowlist');
  if (!Array.isArray(list)) throw new AuditInputError('audit allowlist must be a JSON array');
  return list.map((item, index) => {
    const where = `audit allowlist entry ${index}`;
    if (!isObject(item)) throw new AuditInputError(`${where} is not an object`);
    const fields = ['id', 'package', 'path', 'reason', 'expires', 'owner'] as const;
    for (const field of fields) {
      if (typeof item[field] !== 'string' || item[field] === '')
        throw new AuditInputError(`${where} has no ${field}`);
    }
    const entry = Object.fromEntries(
      fields.map((field) => [field, item[field]]),
    ) as unknown as AllowlistEntry;
    if (!GHSA_ID.test(entry.id)) throw new AuditInputError(`${where}: id ${entry.id} is not a GHSA id`);
    if (!isRealDate(entry.expires)) {
      throw new AuditInputError(`${where}: expires ${entry.expires} is not a YYYY-MM-DD date`);
    }
    return entry;
  });
}

/** Every package in package-lock.json that depends on `pkg` (any kind of dependency), by package name. */
export function dependentsInLockfile(rawLockfile: string, pkg: string): string[] {
  const lock = parseJson(rawLockfile, 'package-lock.json');
  if (!isObject(lock) || !isObject(lock.packages))
    throw new AuditInputError('package-lock.json has no "packages" object');
  const kinds = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] as const;
  const dependents = new Set<string>();
  for (const [location, entry] of Object.entries(lock.packages)) {
    if (!isObject(entry)) continue;
    if (!kinds.some((kind) => isObject(entry[kind]) && pkg in entry[kind])) continue;
    const nameFromPath = location.split('node_modules/').pop() ?? location;
    const name = typeof entry.name === 'string' ? entry.name : nameFromPath;
    dependents.add(name || '(root)');
  }
  return [...dependents].sort();
}

/** Decides the gate. `today` is a UTC date, YYYY-MM-DD; an entry is valid through its `expires` day. */
export function evaluateAudit(input: {
  advisories: Advisory[];
  allowlist: AllowlistEntry[];
  dependents: (pkg: string) => string[];
  today: string;
}): AuditResult {
  const { advisories, allowlist, dependents, today } = input;
  const failures: Failure[] = [];
  const warnings: string[] = [];
  const ignored: AuditResult['ignored'] = [];
  const latestExpiry = addDays(today, MAX_EXPIRY_DAYS);
  const unusable = new Set<AllowlistEntry>();

  for (const entry of allowlist) {
    if (entry.expires < today) {
      unusable.add(entry);
      failures.push({
        message: `allowlist entry ${entry.id} (${entry.package}) expired on ${entry.expires}; owner ${entry.owner} must remove or renew it`,
      });
    } else if (entry.expires > latestExpiry) {
      unusable.add(entry);
      failures.push({
        message: `allowlist entry ${entry.id} (${entry.package}) expires ${entry.expires}, more than ${MAX_EXPIRY_DAYS} days after today`,
      });
    } else if (!advisories.some((a) => a.id === entry.id && a.package === entry.package)) {
      warnings.push(
        `allowlist entry ${entry.id} (${entry.package}) matches no current advisory; remove it (owner ${entry.owner})`,
      );
    }
  }

  for (const advisory of advisories) {
    if (!GATED.includes(advisory.severity)) continue;
    const label = `${advisory.severity} ${advisory.id} in ${advisory.package}: ${advisory.title} (${advisory.url})`;
    const entry = allowlist.find((item) => item.id === advisory.id && item.package === advisory.package);
    if (!entry) {
      failures.push({ message: `${label} is not allowlisted` });
      continue;
    }
    if (unusable.has(entry)) continue; // already reported above: expired, or expiry beyond the cap
    const via = [...new Set([...dependents(advisory.package), ...advisory.npmDependents])].sort();
    const outside = via.filter((name) => name !== entry.path);
    if (via.length === 0 || outside.length > 0) {
      const found = via.length === 0 ? 'no dependents' : outside.join(', ');
      failures.push({
        message: `${label} is allowlisted only under ${entry.path}, but is also reached from: ${found}`,
      });
      continue;
    }
    ignored.push({ advisory, entry });
  }

  return { ok: failures.length === 0, ignored, failures, warnings };
}

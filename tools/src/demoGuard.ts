/**
 * demo:reset's guard (demo-local4, Munif 24 Nov). The reset deletes and rebuilds a database, so it may only ever
 * target the throwaway demo4 database. Every part must match; anything else fails loudly, naming what is wrong.
 */
export interface DemoTarget {
  container: string;
  port: string;
  volume: string;
  database: string;
}

export const DEMO4: Readonly<DemoTarget> = {
  container: 'erp-pg-demo4',
  port: '55444',
  volume: 'erp_demo4-data',
  database: 'erp_demo4',
};

/** What differs from the demo4 target, one message per part; empty when the target is demo4 exactly. */
export function demoTargetProblems(target: DemoTarget): string[] {
  return (Object.keys(DEMO4) as (keyof DemoTarget)[])
    .filter((part) => target[part] !== DEMO4[part])
    .map((part) => `${part} is "${target[part]}", not "${DEMO4[part]}"`);
}

export function assertDemoTarget(target: DemoTarget): void {
  const problems = demoTargetProblems(target);
  if (problems.length > 0) {
    throw new Error(
      `demo:reset refuses to touch this database: ${problems.join('; ')}. It only rebuilds the throwaway demo4 database.`,
    );
  }
}

/**
 * The seed and demo:start may only reach the demo4 database (Munif, 25 Nov): host 127.0.0.1 or localhost, port 55444,
 * database erp_demo4. Messages name the host, port and database only, never the user or password.
 */
export function demoUrlProblems(url: string): string[] {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return ['not a database URL'];
  }
  if (!parsed.protocol.startsWith('postgres')) return ['not a database URL'];
  const problems: string[] = [];
  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname)) {
    problems.push(`host is "${parsed.hostname}", not 127.0.0.1 or localhost`);
  }
  const port = parsed.port || '5432';
  if (port !== DEMO4.port) problems.push(`port is "${port}", not "${DEMO4.port}"`);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (database !== DEMO4.database) problems.push(`database is "${database}", not "${DEMO4.database}"`);
  return problems;
}

export const OWNER_VARIABLES = ['DEMO_OWNER_EMAIL', 'DEMO_OWNER_PASSWORD'] as const;

/** The owner.conf names that are missing or empty; values are never returned. */
export function ownerConfProblems(text: string): string[] {
  const set = new Set(
    text
      .split('\n')
      .map((line) => /^([A-Z_]+)=(.+)$/.exec(line.trim()))
      .filter((m): m is RegExpExecArray => m !== null && (m[2] ?? '').trim() !== '')
      .map((m) => m[1]),
  );
  return OWNER_VARIABLES.filter((name) => !set.has(name)).map((name) => `${name} is missing or empty`);
}

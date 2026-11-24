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

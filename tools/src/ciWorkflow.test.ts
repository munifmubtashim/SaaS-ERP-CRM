import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The CI workflow's triggers and job names. CI runs for pull requests into main and for main itself, so a push to
 * a PR's branch runs it once (as the pull request), not twice. The job names are the required status checks in
 * main's branch protection, so they must not change here without changing the protection rule.
 */
const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');

/** The `branches:` list under one trigger, as written (`[main]`). */
function branchesOf(trigger: 'push' | 'pull_request'): string | undefined {
  const match = new RegExp(`^  ${trigger}:\\n    branches: (\\[[^\\]]*\\])`, 'm').exec(workflow);
  return match?.[1];
}

describe('.github/workflows/ci.yml', () => {
  it('runs on pushes to main only', () => {
    expect(branchesOf('push')).toBe('[main]');
  });

  it('runs on pull requests into main', () => {
    expect(branchesOf('pull_request')).toBe('[main]');
  });

  it('keeps the six job names that branch protection requires', () => {
    const jobs = [
      ...workflow.matchAll(/^ {2}([a-z][a-z0-9-]*):\n {4}(?:name|runs-on|needs|if|timeout-minutes):/gm),
    ].map((match) => match[1]);
    expect(jobs).toEqual(['lint', 'typecheck', 'test', 'build', 'audit', 'secret-scan']);
  });
});

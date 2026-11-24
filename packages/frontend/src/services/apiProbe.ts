/**
 * Whether the api answers at start-up (demo-local4, Munif 24 Nov): `/health` must say `ok` within the time limit.
 * A failed request, no answer in time, or `degraded` (the database is down) all count as down.
 */
export async function apiIsUp(
  health: () => Promise<{ status: 'ok' | 'degraded' }>,
  timeoutMs = 1500,
): Promise<boolean> {
  const timeout = new Promise<false>((resolve) => setTimeout(() => resolve(false), timeoutMs));
  const answer = health().then(
    (res) => res.status === 'ok',
    () => false,
  );
  return Promise.race([answer, timeout]);
}

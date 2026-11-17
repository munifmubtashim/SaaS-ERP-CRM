import { setTimeout as sleep } from 'node:timers/promises';
import { afterAll, describe, expect, it } from 'vitest';
import { createDbClient } from '../config/db.js';

/**
 * ADR 0005 time limits. Primary: timeouts set on the application role. Secondary: the pool size and Prisma's
 * whole-transaction timeout, configured on the client. The role settings come from
 * docker/postgres/init/01-app-role.sh (CI runs the same script); an existing local volume needs its
 * ALTER ROLE lines run once.
 */
const appUrl = process.env.DATABASE_URL;
if (!appUrl) throw new Error('DATABASE_URL is not set. Copy .env.example to .env and run npm run docker:up.');

const app = createDbClient(appUrl, { poolMax: 10, txTimeoutMs: 10_000 });
/** One connection and a 300 ms transaction limit, so both settings are observable. */
const limited = createDbClient(appUrl, { poolMax: 1, txTimeoutMs: 300 });

afterAll(async () => {
  await Promise.all([app.$disconnect(), limited.$disconnect()]);
});

describe('database limits (ADR 0005)', () => {
  it('the application role has statement and idle-in-transaction timeouts', async () => {
    const [row] = await app.$queryRaw<{ statement: string; idle: string }[]>`
      SELECT current_setting('statement_timeout') AS statement,
             current_setting('idle_in_transaction_session_timeout') AS idle`;
    expect(row).toEqual({ statement: '5s', idle: '15s' });
  });

  it('poolMax caps the connections: concurrent queries share the single one', async () => {
    const pid = () => limited.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
    const results = await Promise.all([pid(), pid(), pid()]);
    expect(new Set(results.map(([r]) => r?.pid)).size).toBe(1);
  });

  it('a transaction longer than txTimeoutMs fails, and the pool keeps working', async () => {
    const slow = limited.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1`;
      await sleep(600);
      return tx.$queryRaw`SELECT 1`;
    });
    await expect(slow).rejects.toThrow(/transaction/i);

    const [after] = await limited.$queryRaw<{ ok: number }[]>`SELECT 1 AS ok`;
    expect(after?.ok).toBe(1);
  });
});

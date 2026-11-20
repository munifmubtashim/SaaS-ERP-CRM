import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from '../config/db.js';
import {
  DAL_DIR,
  functionsIn,
  latestMigrationFunctions,
  migrationFolders,
  migrationSql,
} from './sqlFunctions.js';

/**
 * uuid_v7() (ADR 0008 amendment, #27): the database default for every id, so rows inserted by raw SQL (seeds,
 * provisioning) get UUID v7 keys too. PostgreSQL 16 has no built-in for it. Run as the application role.
 * No table uses it yet; A3b adds the defaults.
 */
const appUrl = process.env.DATABASE_URL;
if (!appUrl) throw new Error('DATABASE_URL is not set. Copy .env.example to .env and run npm run docker:up.');

const app: DbClient = createDbClient(appUrl, { poolMax: 2, txTimeoutMs: 10_000 });

afterAll(async () => {
  await app.$disconnect();
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The first 48 bits of a UUID v7 are the Unix time in milliseconds (RFC 9562 section 5.7). */
const millisOf = (id: string) => Number.parseInt(id.replace(/-/g, '').slice(0, 12), 16);

describe('uuid_v7() as the application role', () => {
  it('returns an RFC 9562 version 7 UUID', async () => {
    const [row] = await app.$queryRaw<{ id: string }[]>`SELECT public.uuid_v7()::text AS id`;
    const id = row?.id ?? '';
    expect(id).toMatch(UUID);
    expect(id[14]).toBe('7'); // version nibble
    expect('89ab').toContain(id[19] ?? ''); // variant bits 10xx
  });

  it('starts with the current Unix time in milliseconds', async () => {
    const before = Date.now();
    const [row] = await app.$queryRaw<{ id: string }[]>`SELECT public.uuid_v7()::text AS id`;
    const after = Date.now();
    const millis = millisOf(row?.id ?? '');
    // Allow for clock skew between this process and the database container.
    expect(millis).toBeGreaterThanOrEqual(before - 5_000);
    expect(millis).toBeLessThanOrEqual(after + 5_000);
  });

  it('gives a different value per row (volatile, usable as a column default)', async () => {
    const rows = await app.$queryRaw<{ id: string }[]>`
      SELECT public.uuid_v7()::text AS id FROM generate_series(1, 1000)`;
    expect(new Set(rows.map((r) => r.id)).size).toBe(1000);
  });

  it('sorts a later millisecond after an earlier one', async () => {
    // Three separate statements, run one after the other: first id, a 10 ms pause, second id.
    const [first] = await app.$queryRaw<{ id: string }[]>`SELECT public.uuid_v7()::text AS id`;
    await app.$executeRaw`SELECT pg_sleep(0.01)`; // pg_sleep returns void, which $queryRaw cannot read
    const [second] = await app.$queryRaw<{ id: string }[]>`SELECT public.uuid_v7()::text AS id`;
    const firstId = first?.id ?? '';
    const secondId = second?.id ?? '';
    expect(millisOf(secondId)).toBeGreaterThan(millisOf(firstId));
    expect(secondId > firstId).toBe(true);
  });

  it('never stamps a millisecond that the clock has not reached (truncates, never rounds up)', async () => {
    // In each row the id is made first, then the clock is read again. With truncation the id's millisecond is
    // never later than that reading. Rounding would put about half of all ids 1 ms ahead.
    const rows = await app.$queryRaw<{ id: string; after: string }[]>`
      SELECT public.uuid_v7()::text AS id,
             floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint::text AS after
        FROM generate_series(1, 2000)`;
    const ahead = rows.filter((r) => millisOf(r.id) > Number(r.after));
    expect(ahead).toEqual([]);
  });

  it('is executable by erp_app, through the default PUBLIC grant', async () => {
    const [row] = await app.$queryRaw<{ app: boolean; viaPublic: boolean }[]>`
      SELECT has_function_privilege('erp_app', 'public.uuid_v7()', 'EXECUTE') AS app,
             (p.proacl IS NULL
              OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                          WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')) AS "viaPublic"
        FROM pg_proc p WHERE p.oid = 'public.uuid_v7()'::regprocedure`;
    expect(row).toEqual({ app: true, viaPublic: true });
  });
});

describe('dal/sql/functions/uuid_v7.sql matches the migrations', () => {
  const SOURCE = `${DAL_DIR}sql/functions/uuid_v7.sql`;
  // Read inside each test, so a missing file fails the tests one by one instead of the whole suite.
  const source = () => functionsIn(readFileSync(SOURCE, 'utf8'));

  it('the source defines exactly uuid_v7, as public.uuid_v7()', () => {
    expect([...source().keys()]).toEqual(['uuid_v7']);
    expect(source().get('uuid_v7')).toMatch(/^CREATE FUNCTION public\.uuid_v7\(\)/);
  });

  it('its latest migration defines it the same way', () => {
    expect(latestMigrationFunctions().get('uuid_v7')).toBe(source().get('uuid_v7'));
  });

  it('truncates the millisecond with floor(), in the source and therefore in the migration', () => {
    expect(source().get('uuid_v7')).toContain('floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint');
  });

  it('grants nothing to a role by name (PUBLIC already has EXECUTE on a new function)', () => {
    const all = migrationFolders().map(migrationSql).join('\n');
    expect(all).not.toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.uuid_v7/i);
  });

  it('no table uses it as a default yet (A3b adds them)', () => {
    const all = migrationFolders().map(migrationSql).join('\n');
    expect(all).not.toMatch(/DEFAULT\s+(public\.)?uuid_v7\(\)/i);
  });
});

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
    const [row] = await app.$queryRaw<{ first: string; second: string }[]>`
      WITH a AS (SELECT public.uuid_v7() AS id), pause AS (SELECT pg_sleep(0.01) FROM a)
      SELECT (SELECT id FROM a)::text AS first, (SELECT public.uuid_v7() FROM pause)::text AS second`;
    expect(row).toBeDefined();
    expect(millisOf(row?.second ?? '')).toBeGreaterThan(millisOf(row?.first ?? ''));
    expect((row?.second ?? '') > (row?.first ?? '')).toBe(true);
  });

  it('is executable by erp_app', async () => {
    const [row] = await app.$queryRaw<{ ok: boolean }[]>`
      SELECT has_function_privilege('erp_app', 'public.uuid_v7()', 'EXECUTE') AS ok`;
    expect(row?.ok).toBe(true);
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

  it('the migration that creates it grants EXECUTE to erp_app', () => {
    const folder =
      migrationFolders()
        .filter((f) => functionsIn(migrationSql(f)).has('uuid_v7'))
        .at(-1) ?? '';
    expect(migrationSql(folder)).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.uuid_v7\(\)\s+TO\s+erp_app;/,
    );
  });

  it('no table uses it as a default yet (A3b adds them)', () => {
    const all = migrationFolders().map(migrationSql).join('\n');
    expect(all).not.toMatch(/DEFAULT\s+(public\.)?uuid_v7\(\)/i);
  });
});

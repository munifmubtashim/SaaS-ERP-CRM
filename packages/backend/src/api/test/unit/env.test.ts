import { isAbsolute, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../config/env.js';

const base = { DATABASE_URL: 'postgresql://erp_app:x@localhost:5433/erp' };

describe('loadEnv: database limits (ADR 0005)', () => {
  it('defaults to a pool of 10 and a 10 s request transaction', () => {
    const env = loadEnv(base);
    expect(env.DB_POOL_MAX).toBe(10);
    expect(env.DB_TX_TIMEOUT_MS).toBe(10_000);
  });

  it('reads both from the environment', () => {
    const env = loadEnv({ ...base, DB_POOL_MAX: '4', DB_TX_TIMEOUT_MS: '7500' });
    expect(env.DB_POOL_MAX).toBe(4);
    expect(env.DB_TX_TIMEOUT_MS).toBe(7_500);
  });

  it.each([
    ['DB_POOL_MAX', '0'],
    ['DB_POOL_MAX', 'ten'],
    ['DB_TX_TIMEOUT_MS', '-1'],
    ['DB_TX_TIMEOUT_MS', '2.5'],
  ])('fails fast on %s=%s', (name, value) => {
    expect(() => loadEnv({ ...base, [name]: value })).toThrow(name);
  });
});

describe('loadEnv: STATIC_DIR', () => {
  it('is unset by default, so development serves no frontend from the API', () => {
    expect(loadEnv(base).STATIC_DIR).toBeUndefined();
  });

  it('reads the built frontend folder for the production image', () => {
    expect(loadEnv({ ...base, STATIC_DIR: '/app/public' }).STATIC_DIR).toBe('/app/public');
  });

  it('resolves a relative folder to an absolute path, as res.sendFile requires (Farhan, #17)', () => {
    const dir = loadEnv({ ...base, STATIC_DIR: './public' }).STATIC_DIR;
    expect(dir).toBe(resolve('./public'));
    expect(isAbsolute(dir ?? '')).toBe(true);
  });
});

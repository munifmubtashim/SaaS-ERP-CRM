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

describe('loadEnv: PROVISIONING_DATABASE_URL (ADR 0010, Munif 20 Nov on #32)', () => {
  const url = 'postgresql://erp_provisioner:x@localhost:5433/erp';

  it('is optional in development and tests (provisioning then answers 503)', () => {
    expect(loadEnv(base).PROVISIONING_DATABASE_URL).toBeUndefined();
    expect(loadEnv({ ...base, NODE_ENV: 'test' }).PROVISIONING_DATABASE_URL).toBeUndefined();
  });

  it('is read when set', () => {
    expect(loadEnv({ ...base, PROVISIONING_DATABASE_URL: url }).PROVISIONING_DATABASE_URL).toBe(url);
  });

  it('is required in production: start-up fails without it', () => {
    expect(() => loadEnv({ ...base, NODE_ENV: 'production' })).toThrow('PROVISIONING_DATABASE_URL');
    expect(loadEnv({ ...base, NODE_ENV: 'production', PROVISIONING_DATABASE_URL: url }).NODE_ENV).toBe(
      'production',
    );
  });

  it('must be a URL when set', () => {
    expect(() => loadEnv({ ...base, PROVISIONING_DATABASE_URL: 'not a url' })).toThrow(
      'PROVISIONING_DATABASE_URL',
    );
  });
});

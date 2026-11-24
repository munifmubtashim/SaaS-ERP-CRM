import { describe, expect, it } from 'vitest';
import { apiIsUp } from './apiProbe';
import { DEMO_CAPABLE, resolveDemoData } from './demoData';

/**
 * demo-local4 (Munif, 24 Nov): if the api is down when the app starts, every service falls back to its sample data,
 * and every sample figure keeps its "Demo data" badge. A production build never falls back to sample data.
 */
describe('apiIsUp', () => {
  it('is up when /health answers ok in time', async () => {
    expect(await apiIsUp(async () => ({ status: 'ok' as const }), 50)).toBe(true);
  });

  it('is down when /health says degraded (the database is down)', async () => {
    expect(await apiIsUp(async () => ({ status: 'degraded' as const }), 50)).toBe(false);
  });

  it('is down when the request fails or doesn’t answer in time', async () => {
    expect(await apiIsUp(() => Promise.reject(new Error('connection refused')), 50)).toBe(false);
    expect(await apiIsUp(() => new Promise(() => undefined), 20)).toBe(false);
  });
});

describe('resolveDemoData', () => {
  const chosen = new Set(['organization'] as const);

  it('api up: the chosen set (VITE_DEMO_DATA) stands', () => {
    expect(resolveDemoData(chosen, { production: false, apiUp: true })).toBe(chosen);
  });

  it('api down in development: every service falls back to its sample, marked Demo data', () => {
    expect([...resolveDemoData(chosen, { production: false, apiUp: false })]).toEqual([...DEMO_CAPABLE]);
  });

  it('a production build never uses sample data, api up or down', () => {
    expect([...resolveDemoData(chosen, { production: true, apiUp: false })]).toEqual([]);
  });
});

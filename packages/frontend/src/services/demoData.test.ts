import { describe, expect, it } from 'vitest';
import { DEMO_CAPABLE, DEMO_DEFAULT, parseDemoData } from './demoData';

/**
 * VITE_DEMO_DATA (Munif, 23 Nov): per service, a non-production build may use the sample implementation; a
 * production build never does, whatever the flag says.
 */
describe('parseDemoData', () => {
  it('a production build uses no sample data, even with VITE_DEMO_DATA=all', () => {
    for (const raw of [undefined, '', 'all', 'organization']) {
      expect(parseDemoData(raw, { production: true }).size).toBe(0);
    }
  });

  it('unset in development: sample data only for the services whose API does not exist yet', () => {
    expect([...parseDemoData(undefined, { production: false })]).toEqual([...DEMO_DEFAULT]);
    expect(DEMO_DEFAULT.has('organization')).toBe(true);
    expect((DEMO_DEFAULT as ReadonlySet<string>).has('auth')).toBe(false);
    // GET /v1/reports/owner-dashboard exists (M6, #197): real by default, sample only when named.
    expect(DEMO_DEFAULT.has('report.ownerDashboard')).toBe(false);
    expect(DEMO_CAPABLE.has('report.ownerDashboard')).toBe(true);
  });

  it('a comma list picks services; "all" is every service that has a sample; "none" is real everywhere', () => {
    expect([...parseDemoData(' organization , ', { production: false })]).toEqual(['organization']);
    expect([...parseDemoData('all', { production: false })]).toEqual([...DEMO_CAPABLE]);
    expect(parseDemoData('none', { production: false }).size).toBe(0);
  });

  it('an unknown name or a service without a sample is an error, so a typo never silently means real data', () => {
    expect(() => parseDemoData('organisation', { production: false })).toThrow(/organisation/);
    expect(() => parseDemoData('auth', { production: false })).toThrow(/auth/);
  });

  it('"report" alone means every report call; each report call can also be named on its own', () => {
    const all = parseDemoData('report', { production: false });
    expect([...all].every((name) => name.startsWith('report.'))).toBe(true);
    expect(all.has('report.vatReturn')).toBe(true);
    expect([...parseDemoData('report.vatReturn,report.bankFeed', { production: false })]).toEqual([
      'report.vatReturn',
      'report.bankFeed',
    ]);
  });
});

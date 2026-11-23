import { describe, expect, it } from 'vitest';
import { AuthService } from './authService';
import { createServices } from './index';
import { MockOrganizationService } from './mock/MockOrganizationService';
import { OrganizationService } from './organizationService';

/** Login is real in every build (its route exists); a service is sample only when it is in `demo` (VITE_DEMO_DATA). */
describe('createServices', () => {
  it('uses the real AuthService in a production build and in development', () => {
    expect(createServices(undefined, { demo: new Set() }).auth).toBeInstanceOf(AuthService);
    expect(createServices(undefined, { demo: new Set(['organization']) }).auth).toBeInstanceOf(AuthService);
  });

  it('uses the organization sample only when demo lists it', () => {
    expect(createServices(undefined, { demo: new Set(['organization']) }).organization).toBeInstanceOf(
      MockOrganizationService,
    );
    expect(createServices(undefined, { demo: new Set() }).organization).toBeInstanceOf(OrganizationService);
  });

  it('says which services are sample, so screens can show the Demo data badge', () => {
    expect([...createServices(undefined, { demo: new Set(['organization']) }).demo]).toEqual([
      'organization',
    ]);
    expect(createServices(undefined, { demo: new Set() }).demo.size).toBe(0);
  });
});

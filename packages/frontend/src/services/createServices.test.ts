import { describe, expect, it } from 'vitest';
import { AuthService } from './authService';
import { createServices } from './index';
import { MockOrganizationService } from './mock/MockOrganizationService';
import { OrganizationService } from './organizationService';

/** Login is real in every build (its route exists); mocks stand in only in development, for routes not built yet. */
describe('createServices', () => {
  it('uses the real AuthService in a production build and in development', () => {
    expect(createServices(undefined, { useMocks: false }).auth).toBeInstanceOf(AuthService);
    expect(createServices(undefined, { useMocks: true }).auth).toBeInstanceOf(AuthService);
  });

  it('uses the organization mock only in development', () => {
    expect(createServices(undefined, { useMocks: true }).organization).toBeInstanceOf(
      MockOrganizationService,
    );
    expect(createServices(undefined, { useMocks: false }).organization).toBeInstanceOf(OrganizationService);
  });
});

import { AppError, type RoleCode } from '@erp/shared';
import { describe, expect, it } from 'vitest';
import type { IOrganizationQuery } from './contracts/IOrganizationQuery.js';
import type {
  IProvisioningQuery,
  ProvisionedBranch,
  ProvisionedBusiness,
  ProvisioningBranchInput,
  ProvisioningBusinessInput,
} from './contracts/IProvisioningQuery.js';
import type { IRoleSource } from './contracts/IRoleSource.js';
import { DenyAllRoleSource } from './DenyAllRoleSource.js';
import { OrganizationManager, type ProvisioningCaller } from './OrganizationManager.js';

/**
 * ADR 0010 part 2: the Owner check and the branch-under-an-inactive-business check, with fakes. No database: the
 * database half (RLS, the WITH CHECK, unique names) is tested in dal (#81, #82).
 */
const ORG = '01937000-0000-7000-8000-0000000000a0';
const USER = '01937000-0000-7000-8000-0000000000b0';
const LEGAL = '01937000-0000-7000-8000-0000000000c0';
const BUSINESS = '01937000-0000-7000-8000-0000000000d0';
const caller: ProvisioningCaller = { userId: USER, organizationId: ORG };

class FakeRoles implements IRoleSource {
  asked: { userId: string; organizationId: string }[] = [];
  constructor(private readonly roles: RoleCode[]) {}
  async roleCodesFor(userId: string, organizationId: string): Promise<RoleCode[]> {
    this.asked.push({ userId, organizationId });
    return this.roles;
  }
}

class FakeProvisioning implements IProvisioningQuery {
  calls: string[] = [];
  businesses: { organizationId: string; input: ProvisioningBusinessInput }[] = [];
  branches: { organizationId: string; businessId: string; input: ProvisioningBranchInput }[] = [];
  constructor(private readonly found: { isActive: boolean } | null = { isActive: true }) {}

  async createBusiness(
    organizationId: string,
    input: ProvisioningBusinessInput,
  ): Promise<ProvisionedBusiness> {
    this.calls.push('createBusiness');
    this.businesses.push({ organizationId, input });
    return {
      id: BUSINESS,
      organizationId,
      legalEntityId: input.legalEntityId,
      name: input.name,
      isActive: true,
      version: 1,
    };
  }

  async createBranch(
    organizationId: string,
    businessId: string,
    input: ProvisioningBranchInput,
  ): Promise<ProvisionedBranch> {
    this.calls.push('createBranch');
    this.branches.push({ organizationId, businessId, input });
    return {
      id: '01937000-0000-7000-8000-0000000000e0',
      businessId,
      name: input.name,
      shortCode: input.shortCode,
      isActive: true,
      version: 1,
    };
  }

  async findBusiness(): Promise<{ isActive: boolean } | null> {
    this.calls.push('findBusiness');
    return this.found;
  }
}

const unusedOrganizationQuery = {} as IOrganizationQuery;
const manager = (roles: IRoleSource, provisioning: IProvisioningQuery) =>
  new OrganizationManager(unusedOrganizationQuery, provisioning, roles);

async function appErrorOf(promise: Promise<unknown>): Promise<{ code: string; fieldCodes: string[] }> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return { code: error.code, fieldCodes: error.fields.map((f) => f.code) };
    throw error;
  }
  throw new Error('expected an AppError');
}

describe('OrganizationManager.createBusiness (ADR 0010 part 2)', () => {
  it.each<RoleCode[]>([[], ['business_manager'], ['accountant', 'cashier']])(
    'refuses a caller without the owner role (%j) before any query is called',
    async (...roles) => {
      const provisioning = new FakeProvisioning();
      const error = await appErrorOf(
        manager(new FakeRoles(roles), provisioning).createBusiness(caller, {
          legalEntityId: LEGAL,
          name: 'Demo',
        }),
      );
      expect(error).toEqual({ code: 'FORBIDDEN', fieldCodes: ['organization.owner_only'] });
      expect(provisioning.calls).toEqual([]);
    },
  );

  it("an Owner's call reaches the Query with the caller's organization, and created_by is the caller", async () => {
    const roles = new FakeRoles(['owner']);
    const provisioning = new FakeProvisioning();
    const business = await manager(roles, provisioning).createBusiness(caller, {
      legalEntityId: LEGAL,
      name: 'Demo Motors',
    });
    expect(roles.asked).toEqual([{ userId: USER, organizationId: ORG }]);
    expect(provisioning.businesses).toEqual([
      { organizationId: ORG, input: { legalEntityId: LEGAL, name: 'Demo Motors', createdBy: USER } },
    ]);
    expect(business).toMatchObject({ id: BUSINESS, organizationId: ORG, name: 'Demo Motors', version: 1 });
  });

  it('an organizationId smuggled into the input is dropped: the session decides', async () => {
    const provisioning = new FakeProvisioning();
    await manager(new FakeRoles(['owner']), provisioning).createBusiness(caller, {
      legalEntityId: LEGAL,
      name: 'Demo Motors',
      organizationId: '01937000-0000-7000-8000-0000000000ff',
    } as never);
    expect(provisioning.businesses[0]?.organizationId).toBe(ORG);
    expect(provisioning.businesses[0]?.input).not.toHaveProperty('organizationId');
  });
});

describe('OrganizationManager.createBranch (ADR 0010 part 2)', () => {
  it('refuses a non-Owner before findBusiness or any insert', async () => {
    const provisioning = new FakeProvisioning();
    const error = await appErrorOf(
      manager(new FakeRoles(['branch_manager']), provisioning).createBranch(caller, BUSINESS, {
        name: 'Uttara',
        shortCode: 'UTT',
      }),
    );
    expect(error.code).toBe('FORBIDDEN');
    expect(provisioning.calls).toEqual([]);
  });

  it('a branch under an unknown business (or another organization’s) is 404, with no insert', async () => {
    const provisioning = new FakeProvisioning(null);
    const error = await appErrorOf(
      manager(new FakeRoles(['owner']), provisioning).createBranch(caller, BUSINESS, {
        name: 'Uttara',
        shortCode: 'UTT',
      }),
    );
    expect(error).toEqual({ code: 'NOT_FOUND', fieldCodes: ['organization.business_not_found'] });
    expect(provisioning.calls).toEqual(['findBusiness']);
  });

  it('a branch under a deactivated business is refused after findBusiness, with no insert', async () => {
    const provisioning = new FakeProvisioning({ isActive: false });
    const error = await appErrorOf(
      manager(new FakeRoles(['owner']), provisioning).createBranch(caller, BUSINESS, {
        name: 'Uttara',
        shortCode: 'UTT',
      }),
    );
    expect(error).toEqual({ code: 'CONFLICT', fieldCodes: ['business.inactive'] });
    expect(provisioning.calls).toEqual(['findBusiness']);
  });

  it.each(['utt', 'U', 'TOOLONG', 'U-T', '2UT'])(
    'a short code %j never reaches the Query',
    async (shortCode) => {
      const provisioning = new FakeProvisioning();
      const error = await appErrorOf(
        manager(new FakeRoles(['owner']), provisioning).createBranch(caller, BUSINESS, {
          name: 'Uttara',
          shortCode,
        }),
      );
      expect(error).toEqual({ code: 'VALIDATION_FAILED', fieldCodes: ['branch.short_code_format'] });
      expect(provisioning.calls).toEqual([]);
    },
  );

  it('an Owner creates the branch under an active business, as the caller', async () => {
    const provisioning = new FakeProvisioning();
    const branch = await manager(new FakeRoles(['owner']), provisioning).createBranch(caller, BUSINESS, {
      name: 'Uttara',
      shortCode: 'AG2',
    });
    expect(provisioning.calls).toEqual(['findBusiness', 'createBranch']);
    expect(provisioning.branches).toEqual([
      {
        organizationId: ORG,
        businessId: BUSINESS,
        input: { name: 'Uttara', shortCode: 'AG2', createdBy: USER },
      },
    ]);
    expect(branch).toMatchObject({ businessId: BUSINESS, shortCode: 'AG2' });
  });
});

describe('DenyAllRoleSource, the interim source until A5 (decided by Farhan on #32)', () => {
  it('gives no roles, so even the organization’s real Owner is refused', async () => {
    const provisioning = new FakeProvisioning();
    const error = await appErrorOf(
      manager(new DenyAllRoleSource(), provisioning).createBusiness(caller, {
        legalEntityId: LEGAL,
        name: 'Demo',
      }),
    );
    expect(error.code).toBe('FORBIDDEN');
    expect(provisioning.calls).toEqual([]);
  });
});

import {
  AppError,
  branchShortCodeSchema,
  type CreateBranchInput,
  type CreateBusinessInput,
  type ProvisionedBranchView,
  type ProvisionedBusinessView,
} from '@erp/shared';
import type { IOrganizationQuery } from './contracts/IOrganizationQuery.js';
import type { IProvisioningQuery } from './contracts/IProvisioningQuery.js';
import type { IRoleSource } from './contracts/IRoleSource.js';

/** Who is asking: the signed-in user and the organization of their session. Never taken from a request body. */
export interface ProvisioningCaller {
  userId: string;
  organizationId: string;
}

/**
 * Organization module: business rules. No Express, no SQL. Owner: Munif.
 * Creating businesses and branches (ADR 0010 part 2): Owner only, checked before any query; a branch only under
 * an active business of the caller's organization. The database checks both again (ADR 0009 part 2).
 * TODO(Munif): roles, scopes and the audit log (roadmap 4.2, 5.1, 5.2) come with their plans.
 */
export class OrganizationManager {
  constructor(
    protected readonly query: IOrganizationQuery,
    private readonly provisioning: IProvisioningQuery,
    private readonly roles: IRoleSource,
  ) {}

  async createBusiness(
    caller: ProvisioningCaller,
    input: CreateBusinessInput,
  ): Promise<ProvisionedBusinessView> {
    await this.requireOwner(caller);
    const business = await this.provisioning.createBusiness(caller.organizationId, {
      legalEntityId: input.legalEntityId,
      name: input.name,
      ...(input.bin === undefined ? {} : { bin: input.bin }),
      ...(input.address === undefined ? {} : { address: input.address }),
      createdBy: caller.userId,
    });
    return {
      id: business.id,
      organizationId: business.organizationId,
      legalEntityId: business.legalEntityId,
      name: business.name,
      isActive: business.isActive,
      version: business.version,
    };
  }

  async createBranch(
    caller: ProvisioningCaller,
    businessId: string,
    input: CreateBranchInput,
  ): Promise<ProvisionedBranchView> {
    await this.requireOwner(caller);
    if (!branchShortCodeSchema.safeParse(input.shortCode).success) {
      throw new AppError('VALIDATION_FAILED', 'The short code is not valid.', [
        {
          path: 'shortCode',
          code: 'branch.short_code_format',
          message: '2 to 6 characters: a capital letter first, then capital letters or digits.',
        },
      ]);
    }
    const business = await this.provisioning.findBusiness(caller.organizationId, businessId);
    if (!business) {
      // 404, not 403: the answer must not reveal that another organization's id exists (ADR 0010).
      throw new AppError('NOT_FOUND', 'Business not found.', [
        { path: 'businessId', code: 'organization.business_not_found', message: 'Business not found.' },
      ]);
    }
    if (!business.isActive) {
      throw new AppError('CONFLICT', 'This business is deactivated.', [
        {
          path: 'businessId',
          code: 'business.inactive',
          message: 'A deactivated business gets no new branches.',
        },
      ]);
    }
    const branch = await this.provisioning.createBranch(caller.organizationId, businessId, {
      name: input.name,
      shortCode: input.shortCode,
      ...(input.address === undefined ? {} : { address: input.address }),
      createdBy: caller.userId,
    });
    return {
      id: branch.id,
      businessId: branch.businessId,
      name: branch.name,
      shortCode: branch.shortCode,
      isActive: branch.isActive,
      version: branch.version,
    };
  }

  /** ADR 0008 tests 12 and 13: refused before any provisioning query is called. */
  private async requireOwner(caller: ProvisioningCaller): Promise<void> {
    const roles = await this.roles.roleCodesFor(caller.userId, caller.organizationId);
    if (!roles.includes('owner')) {
      throw new AppError('FORBIDDEN', 'Only the Owner can create businesses and branches.', [
        { path: '', code: 'organization.owner_only', message: 'Only the Owner can do this.' },
      ]);
    }
  }
}

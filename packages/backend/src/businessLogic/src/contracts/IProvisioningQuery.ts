/**
 * What OrganizationManager needs from the provisioning path (ADR 0010; the consumer owns the contract). dal's
 * ProvisioningQuery satisfies it without importing it; createManagers checks that at compile time.
 */
export interface ProvisioningBusinessInput {
  legalEntityId: string;
  name: string;
  bin?: string;
  address?: string;
  /** The calling Owner's user id (ADR 0010, decided by Munif, 21 Nov). */
  createdBy: string;
}

export interface ProvisioningBranchInput {
  name: string;
  shortCode: string;
  address?: string;
  createdBy: string;
}

export interface ProvisionedBusiness {
  id: string;
  organizationId: string;
  legalEntityId: string;
  name: string;
  isActive: boolean;
  version: number;
}

export interface ProvisionedBranch {
  id: string;
  businessId: string;
  name: string;
  shortCode: string;
  isActive: boolean;
  version: number;
}

export interface IProvisioningQuery {
  createBusiness(organizationId: string, input: ProvisioningBusinessInput): Promise<ProvisionedBusiness>;
  createBranch(
    organizationId: string,
    businessId: string,
    input: ProvisioningBranchInput,
  ): Promise<ProvisionedBranch>;
  /** `{ isActive }` for a business of this organization; null for an unknown id or another organization's. */
  findBusiness(organizationId: string, businessId: string): Promise<{ isActive: boolean } | null>;
}

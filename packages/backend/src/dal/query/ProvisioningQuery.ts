import { AppError } from '@erp/shared';
import type { DbClient, DbClientOptions } from '../config/db.js';
import { createProvisionerClient } from '../config/provisionerDb.js';
import { BranchDTO, BusinessDTO } from '../dto/OrganizationDTO.js';

/** What creating a business needs. The organization is never in here: it comes from the caller's session. */
export interface CreateBusinessInput {
  legalEntityId: string;
  name: string;
  bin?: string | null;
  address?: string | null;
  /** The calling Owner's user id (ADR 0010; decided by Munif, 21 Nov). */
  createdBy: string;
}

/** What creating a branch needs. shortCode never changes after insert (ADR 0009). */
export interface CreateBranchInput {
  name: string;
  /** 2 to 6 characters, a letter first, uppercase letters or digits; the database CHECK enforces it. */
  shortCode: string;
  address?: string | null;
  createdBy: string;
}

type Tx = Parameters<Parameters<DbClient['$transaction']>[0]>[0];

const BUSINESS_COLUMNS = {
  id: true,
  organizationId: true,
  legalEntityId: true,
  name: true,
  isActive: true,
  version: true,
  createdAt: true,
  createdBy: true,
} as const;

const BRANCH_COLUMNS = {
  id: true,
  businessId: true,
  name: true,
  shortCode: true,
  isActive: true,
  version: true,
  createdAt: true,
  createdBy: true,
} as const;

/** Unique indexes whose violation is the caller's mistake, not a 500 (ADR 0009, ADR 0010). */
const CONFLICTS = [
  {
    index: 'business_organization_name_ci_key',
    field: {
      path: 'name',
      code: 'business.name_taken',
      message: 'A business with this name already exists.',
    },
  },
  {
    index: 'branch_business_id_short_code_key',
    field: {
      path: 'shortCode',
      code: 'branch.short_code_taken',
      message: 'Another branch of this business uses this short code.',
    },
  },
] as const;

/** Turns a unique violation on one of CONFLICTS' indexes into 409 CONFLICT; anything else is rethrown. */
function asConflict(error: unknown): never {
  if (error instanceof Error && 'code' in error && error.code === 'P2002') {
    const detail = JSON.stringify((error as { meta?: unknown }).meta ?? {});
    const match = CONFLICTS.find((conflict) => detail.includes(conflict.index));
    if (match) throw new AppError('CONFLICT', match.field.message, [match.field]);
  }
  throw error;
}

/**
 * Creates businesses and branches as erp_provisioner (ADR 0008 section 1, ADR 0010 part 1): the only code that
 * may. Each call is ONE transaction on the provisioner's own client that sets app.organization_id with
 * set_config(…, true), which is SET LOCAL, and never app.business_ids or app.branch_ids (#27). RLS (ADR 0009
 * part 2) keeps every call inside that organization and refuses a branch under an inactive business.
 *
 * Not a BaseQuery (it has no tenant scope) and not an UnscopedQuery (it isn't erp_app): ADR 0005's named
 * exception. Built only through createProvisioningQuery, so the client never leaves dal.
 */
export class ProvisioningQuery {
  private constructor(private readonly db: DbClient | null) {}

  /** @internal Use createProvisioningQuery. */
  static create(provisioningUrl: string | undefined, options: DbClientOptions): ProvisioningQuery {
    return new ProvisioningQuery(provisioningUrl ? createProvisionerClient(provisioningUrl, options) : null);
  }

  async createBusiness(organizationId: string, input: CreateBusinessInput): Promise<BusinessDTO> {
    return this.inOrganization(organizationId, async (tx) => {
      const row = await tx.business
        .create({
          data: {
            organizationId,
            legalEntityId: input.legalEntityId,
            name: input.name,
            bin: input.bin ?? null,
            address: input.address ?? null,
            createdBy: input.createdBy,
          },
          select: BUSINESS_COLUMNS,
        })
        .catch(asConflict);
      return BusinessDTO.fromRow(row);
    });
  }

  async createBranch(
    organizationId: string,
    businessId: string,
    input: CreateBranchInput,
  ): Promise<BranchDTO> {
    return this.inOrganization(organizationId, async (tx) => {
      const row = await tx.branch
        .create({
          data: {
            businessId,
            name: input.name,
            shortCode: input.shortCode,
            address: input.address ?? null,
            createdBy: input.createdBy,
          },
          select: BRANCH_COLUMNS,
        })
        .catch(asConflict);
      return BranchDTO.fromRow(row);
    });
  }

  /** For the Manager's "no branch under a deactivated or unknown business" check (ADR 0010 part 2). */
  async findBusiness(organizationId: string, businessId: string): Promise<{ isActive: boolean } | null> {
    return this.inOrganization(organizationId, (tx) =>
      tx.business.findUnique({ where: { id: businessId }, select: { isActive: true } }),
    );
  }

  async close(): Promise<void> {
    await this.db?.$disconnect();
  }

  private inOrganization<T>(organizationId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    if (!this.db) {
      return Promise.reject(
        new AppError('SERVICE_UNAVAILABLE', 'Creating businesses and branches is not configured here.', [
          {
            path: '',
            code: 'provisioning.not_configured',
            message: 'PROVISIONING_DATABASE_URL is not set.',
          },
        ]),
      );
    }
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
      return fn(tx);
    });
  }
}

/**
 * The only way to get a ProvisioningQuery (ADR 0010, Farhan's decision on #32): it builds the provisioner
 * client and the Query together, so businessLogic's createManagers never holds the raw connection. With no URL
 * (tests and local development), every call answers 503 provisioning.not_configured.
 */
export function createProvisioningQuery(
  provisioningUrl: string | undefined,
  options: DbClientOptions,
): ProvisioningQuery {
  return ProvisioningQuery.create(provisioningUrl, options);
}

import { AppError } from '@erp/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from '../config/db.js';
import { createProvisioningQuery, type ProvisioningQuery } from '../query/ProvisioningQuery.js';
import { addBusiness, createTree, newIds, type Tree } from './support/orgTree.js';

/**
 * ADR 0010 part 1 (A3c): ProvisioningQuery, connected as erp_provisioner through PROVISIONING_DATABASE_URL.
 * Each call is one transaction that sets app.organization_id only. ADR 0009's erp_app (TO erp_app) and owner
 * (TO CURRENT_USER) policies are on the tables throughout, and the creates still succeed. Fixtures are made by
 * the migration owner through the shared helper.
 */
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
const provisioningUrl = process.env.PROVISIONING_DATABASE_URL;
if (!ownerUrl || !provisioningUrl) {
  throw new Error('MIGRATION_DATABASE_URL and PROVISIONING_DATABASE_URL must be set (see .env.example).');
}

const LIMITS = { poolMax: 2, txTimeoutMs: 10_000 };
const owner: DbClient = createDbClient(ownerUrl, LIMITS);
const provisioning: ProvisioningQuery = createProvisioningQuery(provisioningUrl, LIMITS);

let x: Tree;
let y: Tree;
let caller: string;

beforeAll(async () => {
  x = await createTree(owner);
  y = await createTree(owner);
  [caller] = (await owner.$transaction((tx) => newIds(tx, 1))) as [string];
});

afterAll(async () => {
  await Promise.all([owner.$disconnect(), provisioning.close()]);
});

/** The AppError a promise rejects with, so its code and fields can be compared. */
async function appErrorOf(promise: Promise<unknown>): Promise<{ code: string; fields: unknown }> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return { code: error.code, fields: error.fields };
    throw error;
  }
  throw new Error('expected an AppError, but the call succeeded');
}

const uniqueName = (label: string) => `${label} ${Math.random().toString(36).slice(2, 10)}`;

describe('createBusiness and createBranch, as erp_provisioner', () => {
  it('creates a business and a branch in its organization, stores the caller, and returns the rows', async () => {
    const name = uniqueName('Provisioned');
    const business = await provisioning.createBusiness(x.organizationId, {
      legalEntityId: x.legalEntityId,
      name,
      createdBy: caller,
    });
    expect(business).toMatchObject({
      organizationId: x.organizationId,
      legalEntityId: x.legalEntityId,
      name,
      isActive: true,
      version: 1,
      createdBy: caller,
    });
    expect(business.id).toMatch(/^[0-9a-f-]{36}$/);

    const branch = await provisioning.createBranch(x.organizationId, business.id, {
      name: 'Main Branch',
      shortCode: 'UTT',
      createdBy: caller,
    });
    expect(branch).toMatchObject({
      businessId: business.id,
      shortCode: 'UTT',
      version: 1,
      createdBy: caller,
    });
  });

  it("refuses a business that names another organization's legal entity (the composite key)", async () => {
    await expect(
      provisioning.createBusiness(x.organizationId, {
        legalEntityId: y.legalEntityId,
        name: uniqueName('Cross'),
        createdBy: caller,
      }),
    ).rejects.toThrow();
  });

  it('a second business with the same name in any letter case: 409 business.name_taken, nothing inserted', async () => {
    const name = uniqueName('Demo Motors');
    await provisioning.createBusiness(x.organizationId, {
      legalEntityId: x.legalEntityId,
      name,
      createdBy: caller,
    });
    const error = await appErrorOf(
      provisioning.createBusiness(x.organizationId, {
        legalEntityId: x.legalEntityId,
        name: name.toUpperCase(),
        createdBy: caller,
      }),
    );
    expect(error).toEqual({
      code: 'CONFLICT',
      fields: [expect.objectContaining({ path: 'name', code: 'business.name_taken' })],
    });
    const count = await owner.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM business WHERE lower(name) = lower(${name})`;
    expect(count).toEqual([{ n: 1 }]);
  });

  it('shortCode: UTT twice in one business is 409 branch.short_code_taken; UTT in another business is fine', async () => {
    const first = await provisioning.createBusiness(x.organizationId, {
      legalEntityId: x.legalEntityId,
      name: uniqueName('First'),
      createdBy: caller,
    });
    const second = await provisioning.createBusiness(x.organizationId, {
      legalEntityId: x.legalEntityId,
      name: uniqueName('Second'),
      createdBy: caller,
    });
    const input = { name: 'Uttara', shortCode: 'UTT', createdBy: caller };
    const made = await provisioning.createBranch(x.organizationId, first.id, input);
    expect(made.shortCode).toBe('UTT');
    const error = await appErrorOf(provisioning.createBranch(x.organizationId, first.id, input));
    expect(error).toEqual({
      code: 'CONFLICT',
      fields: [expect.objectContaining({ path: 'shortCode', code: 'branch.short_code_taken' })],
    });
    expect((await provisioning.createBranch(x.organizationId, second.id, input)).shortCode).toBe('UTT');
  });

  it("refuses a branch under another organization's business", async () => {
    await expect(
      provisioning.createBranch(x.organizationId, y.businessId, {
        name: 'Planted',
        shortCode: 'PLT',
        createdBy: caller,
      }),
    ).rejects.toThrow(/row-level security/);
  });

  it('refuses a branch under a deactivated business of its own organization (the WITH CHECK)', async () => {
    const closed = await addBusiness(owner, x, uniqueName('Closed'), false);
    await expect(
      provisioning.createBranch(x.organizationId, closed, {
        name: 'Too Late',
        shortCode: 'LATE',
        createdBy: caller,
      }),
    ).rejects.toThrow(/row-level security/);
  });
});

describe('findBusiness', () => {
  it('returns isActive for a business of the organization, and nothing for another organization or an unknown id', async () => {
    const closed = await addBusiness(owner, x, uniqueName('Shut'), false);
    expect(await provisioning.findBusiness(x.organizationId, x.businessId)).toEqual({ isActive: true });
    expect(await provisioning.findBusiness(x.organizationId, closed)).toEqual({ isActive: false });
    expect(await provisioning.findBusiness(x.organizationId, y.businessId)).toBeNull();
    const [unknown] = (await owner.$transaction((tx) => newIds(tx, 1))) as [string];
    expect(await provisioning.findBusiness(x.organizationId, unknown)).toBeNull();
  });
});

describe('PROVISIONING_DATABASE_URL not set (tests and local development)', () => {
  it('refuses every call with 503 provisioning.not_configured, without touching a database', async () => {
    const unconfigured = createProvisioningQuery(undefined, LIMITS);
    const expected = {
      code: 'SERVICE_UNAVAILABLE',
      fields: [expect.objectContaining({ code: 'provisioning.not_configured' })],
    };
    expect(
      await appErrorOf(
        unconfigured.createBusiness(x.organizationId, {
          legalEntityId: x.legalEntityId,
          name: 'n',
          createdBy: caller,
        }),
      ),
    ).toEqual(expected);
    expect(
      await appErrorOf(
        unconfigured.createBranch(x.organizationId, x.businessId, {
          name: 'n',
          shortCode: 'NN',
          createdBy: caller,
        }),
      ),
    ).toEqual(expected);
    expect(await appErrorOf(unconfigured.findBusiness(x.organizationId, x.businessId))).toEqual(expected);
    await unconfigured.close();
  });
});

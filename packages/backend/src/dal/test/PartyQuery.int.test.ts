import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from '../config/db.js';
import { runInTenantScope } from '../config/tenantScope.js';
import { PartyQuery, type NewParty } from '../query/PartyQuery.js';
import { createTree, type Tree } from './support/orgTree.js';

/**
 * PartyQuery (ADR 0019 section 5: create, find, edit with the version check), as erp_app inside the request's
 * tenant transaction. The table's own rules are Party.int.test.ts; this file tests what the Query adds: money as
 * strings, name_bn kept null, the business from the scope, and ADR 0019 test 8 (a stale version changes nothing).
 */
const appUrl = process.env.DATABASE_URL;
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
if (!appUrl || !ownerUrl)
  throw new Error('DATABASE_URL and MIGRATION_DATABASE_URL must be set (see .env.example).');

const owner: DbClient = createDbClient(ownerUrl, { poolMax: 2, txTimeoutMs: 10_000 });
const app: DbClient = createDbClient(appUrl, { poolMax: 4, txTimeoutMs: 15_000 });
const query = new PartyQuery();
const USER = randomUUID();

let x: Tree;
let y: Tree;

beforeAll(async () => {
  [x, y] = await Promise.all([createTree(owner), createTree(owner)]);
});

afterAll(async () => {
  await Promise.all([owner.$disconnect(), app.$disconnect()]);
});

const inRequest = <T>(tree: Tree, fn: () => Promise<T>) =>
  runInTenantScope(
    app,
    { organizationId: tree.organizationId, businessIds: [tree.businessId], branchIds: [tree.branchId] },
    fn,
  );

const party = (tree: Tree, overrides: Partial<NewParty> = {}): NewParty => ({
  code: `C-${randomBytes(4).toString('hex')}`,
  name: 'Karim Traders',
  nameBn: null,
  kind: 'company',
  isCustomer: true,
  isSupplier: false,
  phoneE164: '+8801812345678',
  altPhoneE164: null,
  email: null,
  address: null,
  area: 'Mirpur',
  creditLimit: '50000.00',
  payTermDays: 30,
  createdBranchId: tree.branchId,
  createdBy: USER,
  ...overrides,
});

describe('PartyQuery.create and find', () => {
  it('creates in the request business, version 1; money comes back as a string and a blank Bangla name as null', async () => {
    const created = await inRequest(x, () => query.create(party(x)));
    expect(created).toMatchObject({
      businessId: x.businessId,
      name: 'Karim Traders',
      nameBn: null,
      creditLimit: '50000.00',
      status: 'active',
      isWalkIn: false,
      createdBranchId: x.branchId,
      createdBy: USER,
      version: 1,
    });
    expect(await inRequest(x, () => query.find(created.id))).toEqual(created);
  });

  it('no credit limit reads back as null, and 0.00 as "0.00"', async () => {
    const none = await inRequest(x, () => query.create(party(x, { creditLimit: null })));
    const zero = await inRequest(x, () => query.create(party(x, { creditLimit: '0.00' })));
    expect([none.creditLimit, zero.creditLimit]).toEqual([null, '0.00']);
  });

  it('finds nothing of another business, even by id', async () => {
    const inY = await inRequest(y, () => query.create(party(y)));
    expect(await inRequest(x, () => query.find(inY.id))).toBeNull();
  });
});

describe('ADR 0019 test 8: the version check', () => {
  it('an edit with the version read raises it; a second edit with the same stale version changes nothing', async () => {
    const created = await inRequest(x, () => query.create(party(x)));
    const edited = await inRequest(x, () =>
      query.edit(created.id, 1, { name: 'Karim & Sons', creditLimit: '75000.00' }),
    );
    expect(edited).toMatchObject({ name: 'Karim & Sons', creditLimit: '75000.00', version: 2 });
    expect(await inRequest(x, () => query.edit(created.id, 1, { name: 'Stale' }))).toBeNull();
    expect(await inRequest(x, () => query.find(created.id))).toMatchObject({
      name: 'Karim & Sons',
      version: 2,
    });
  });

  it("an edit of another business's party changes nothing", async () => {
    const inY = await inRequest(y, () => query.create(party(y)));
    expect(await inRequest(x, () => query.edit(inY.id, 1, { name: 'X' }))).toBeNull();
    expect(await inRequest(y, () => query.find(inY.id))).toMatchObject({ name: 'Karim Traders', version: 1 });
  });
});

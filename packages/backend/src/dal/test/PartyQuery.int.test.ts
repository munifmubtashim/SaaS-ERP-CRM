import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from '../config/db.js';
import { runInTenantScope } from '../config/tenantScope.js';
import { PartyQuery, type NewParty } from '../query/PartyQuery.js';
import { addBranch, createTree, type Tree } from './support/orgTree.js';

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

// ADR 0056: the list and the duplicate-phone lookup. Each test makes its own business, so it reads only its rows.
describe('PartyQuery.list (customers, by name then id, contains-search)', () => {
  let tree: Tree;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    tree = await createTree(owner);
    const rows: [string, Partial<NewParty>][] = [
      ['anwar', { name: 'Anwar Stores', phoneE164: '+8801711000001', code: 'C-000101' }],
      ['babul', { name: 'Babul Motors', phoneE164: '+8801711000002', code: 'C-000102' }],
      ['babul2', { name: 'Babul Motors', phoneE164: '+8801711000003', code: 'C-000103' }],
      ['supplier', { name: 'Aaa Supplier', isCustomer: false, isSupplier: true, code: 'S-000001' }],
      ['both', { name: 'Both Ways', isSupplier: true, code: 'C-000104' }],
    ];
    for (const [key, overrides] of rows) {
      ids[key] = (await inRequest(tree, () => query.create(party(tree, overrides)))).id;
    }
  });

  const names = (rows: { name: string }[]) => rows.map((r) => r.name);

  it('lists customers only (the walk-in party too), ordered by name then id', async () => {
    const rows = await inRequest(tree, () => query.list({ limit: 10 }));
    expect(names(rows)).toEqual([
      'Anwar Stores',
      'Babul Motors',
      'Babul Motors',
      'Both Ways',
      'Walk-in customer',
    ]);
    const [first, second] = rows.filter((r) => r.name === 'Babul Motors');
    expect((first?.id ?? '') < (second?.id ?? '')).toBe(true);
  });

  it('continues after a cursor (name, id), so two parties with the same name are not skipped', async () => {
    const babul = await inRequest(tree, () => query.find(ids.babul ?? ''));
    const rows = await inRequest(tree, () =>
      query.list({ limit: 10, after: { name: babul?.name ?? '', id: babul?.id ?? '' } }),
    );
    expect(rows.map((r) => r.id)[0]).toBe(ids.babul2);
  });

  it('searches name, code and phone by contains, case-insensitively; % and _ are characters', async () => {
    const search = (term: string) => inRequest(tree, () => query.list({ limit: 10, search: term }));
    expect(names(await search('motors'))).toEqual(['Babul Motors', 'Babul Motors']);
    expect(names(await search('000101'))).toEqual(['Anwar Stores']);
    expect(names(await search('01711000002'))).toEqual(['Babul Motors']);
    expect(await search('%')).toEqual([]);
  });

  it('filters by status and by "also a supplier"', async () => {
    expect(names(await inRequest(tree, () => query.list({ limit: 10, alsoSupplier: true })))).toEqual([
      'Both Ways',
    ]);
    expect(await inRequest(tree, () => query.list({ limit: 10, status: 'inactive' }))).toEqual([]);
  });

  it("never lists another business's parties", async () => {
    const rows = await inRequest(y, () => query.list({ limit: 100 }));
    expect(rows.some((r) => Object.values(ids).includes(r.id))).toBe(false);
  });
});

describe('PartyQuery.findByPhones (ADR 0019 tests 11 and 12)', () => {
  let tree: Tree;
  let other: Tree;
  let activeId: string;

  beforeAll(async () => {
    [tree, other] = await Promise.all([createTree(owner), createTree(owner)]);
    activeId = (
      await inRequest(tree, () =>
        query.create(
          party(tree, { name: 'Phone Match', phoneE164: '+8801722000001', altPhoneE164: '+8801722000009' }),
        ),
      )
    ).id;
    const inactive = await inRequest(tree, () =>
      query.create(party(tree, { name: 'Gone Away', phoneE164: '+8801722000002' })),
    );
    await inRequest(tree, () => query.edit(inactive.id, 1, { status: 'inactive' }));
    await inRequest(other, () =>
      query.create(party(other, { name: 'Elsewhere', phoneE164: '+8801722000003' })),
    );
  });

  it('finds an active party by its phone or its alternative phone, with id, code, name and both phones', async () => {
    const byPhone = await inRequest(tree, () => query.findByPhones(['+8801722000001'], null));
    const byAlt = await inRequest(tree, () => query.findByPhones(['+8801722000009'], null));
    expect(byPhone).toEqual([
      expect.objectContaining({
        id: activeId,
        name: 'Phone Match',
        phoneE164: '+8801722000001',
        altPhoneE164: '+8801722000009',
      }),
    ]);
    expect(byAlt.map((m) => m.id)).toEqual([activeId]);
    expect(Object.keys(byPhone[0] ?? {}).sort()).toEqual(['altPhoneE164', 'code', 'id', 'name', 'phoneE164']);
  });

  it('ignores an inactive party, the party being edited, and the walk-in placeholder phone', async () => {
    expect(await inRequest(tree, () => query.findByPhones(['+8801722000002'], null))).toEqual([]);
    expect(await inRequest(tree, () => query.findByPhones(['+8801722000001'], activeId))).toEqual([]);
    expect(await inRequest(tree, () => query.findByPhones(['+8801000000000'], null))).toEqual([]);
  });

  it("does not see another business's phone, so nothing leaks (ADR 0019 test 12)", async () => {
    expect(await inRequest(tree, () => query.findByPhones(['+8801722000003'], null))).toEqual([]);
  });
});

describe('ADR 0019 test 16: a party is business-wide, so every branch of the business lists it', () => {
  it('a party created at branch 2 is listed in a request scoped to branch 1 only', async () => {
    const tree = await createTree(owner);
    const branch2 = await addBranch(owner, tree.organizationId, tree.businessId, 'BR2');
    const made = await runInTenantScope(
      app,
      { organizationId: tree.organizationId, businessIds: [tree.businessId], branchIds: [branch2] },
      () => query.create(party(tree, { name: 'Branch Two Customer', createdBranchId: branch2 })),
    );
    const listed = await inRequest(tree, () => query.list({ limit: 10, search: 'branch two' }));
    expect(listed.map((r) => r.id)).toEqual([made.id]);
  });
});

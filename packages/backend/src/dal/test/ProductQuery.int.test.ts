import { randomBytes, randomUUID } from 'node:crypto';
import { AppError } from '@erp/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from '../config/db.js';
import { runInTenantScope } from '../config/tenantScope.js';
import { ProductQuery, type NewProduct } from '../query/ProductQuery.js';
import { addBusiness, createTree, type Tree } from './support/orgTree.js';

/**
 * ProductQuery (ADR 0020 section 4: list, find, create, edit with the version check), as erp_app inside the
 * request's tenant transaction. The table's own rules (grants, TRUNCATE, owner DELETE) are ProductCatalogue.int.test.ts
 * (#105); this file tests what the Query adds: money as strings, business scope, search and cursor, and the
 * optimistic version check, including two parallel edits of one version.
 */
const appUrl = process.env.DATABASE_URL;
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
if (!appUrl || !ownerUrl)
  throw new Error('DATABASE_URL and MIGRATION_DATABASE_URL must be set (see .env.example).');

const owner: DbClient = createDbClient(ownerUrl, { poolMax: 2, txTimeoutMs: 10_000 });
const app: DbClient = createDbClient(appUrl, { poolMax: 6, txTimeoutMs: 15_000 });
const query = new ProductQuery();
const USER = randomUUID();

let x: Tree;
let y: Tree;

beforeAll(async () => {
  [x, y] = await Promise.all([createTree(owner), createTree(owner)]);
});

afterAll(async () => {
  await Promise.all([owner.$disconnect(), app.$disconnect()]);
});

const inRequest = <T>(tree: Tree, fn: () => Promise<T>, businessIds = [tree.businessId]) =>
  runInTenantScope(
    app,
    { organizationId: tree.organizationId, businessIds, branchIds: [tree.branchId] },
    fn,
    { readOnly: businessIds.length > 1 },
  );

const tag = () => randomBytes(4).toString('hex');
const product = (overrides: Partial<NewProduct> = {}): NewProduct => ({
  code: `P-${tag()}`,
  name: 'Helmet',
  nameBn: null,
  brand: 'Vega',
  category: 'Accessories',
  unit: 'pcs',
  tracking: 'quantity',
  sellPrice: '2500.50',
  createdBy: USER,
  ...overrides,
});

describe('ProductQuery.create and find (ADR 0020 test 1, product half)', () => {
  it('creates in the request business; money comes back as a string; version 1; find reads it back', async () => {
    const created = await inRequest(x, () => query.create(product({ sellPrice: '125000.00' })));
    expect(created).toMatchObject({
      businessId: x.businessId,
      sellPrice: '125000.00',
      status: 'active',
      version: 1,
      createdBy: USER,
    });
    expect(typeof created.sellPrice).toBe('string');
    expect(await inRequest(x, () => query.find(created.id))).toEqual(created);
  });

  it("business Y can't find, list or guess X's product", async () => {
    const created = await inRequest(x, () => query.create(product({ name: `Hidden ${tag()}` })));
    expect(await inRequest(y, () => query.find(created.id))).toBeNull();
    const listed = await inRequest(y, () => query.list({ search: created.name, limit: 50 }));
    expect(listed).toEqual([]);
  });

  it('a second product with the same code in the business is 409 product.code_taken; in another business it is accepted', async () => {
    const code = `DUP-${tag()}`;
    await inRequest(x, () => query.create(product({ code })));
    const error = await inRequest(x, () => query.create(product({ code }))).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('CONFLICT');
    expect((error as AppError).fields.map((field) => field.code)).toEqual(['product.code_taken']);
    await expect(inRequest(y, () => query.create(product({ code })))).resolves.toMatchObject({ code });
  });

  it('a create in a scope of several businesses is refused (a product belongs to exactly one)', async () => {
    const other = await addBusiness(owner, x, `Second ${tag()}`);
    await expect(inRequest(x, () => query.create(product()), [x.businessId, other])).rejects.toThrow(
      /several businesses|exactly one business/,
    );
  });
});

describe('ProductQuery.list', () => {
  it('searches name, code and brand without regard to case, and filters by status', async () => {
    const word = `Zq${tag()}`;
    const [byName, byCode, byBrand] = await inRequest(
      x,
      async () =>
        [
          await query.create(product({ name: `${word} visor` })),
          await query.create(product({ code: `${word.toUpperCase()}-1` })),
          await query.create(product({ brand: `${word} Motors`, status: 'archived' })),
        ] as const,
    );
    const ids = (rows: { id: string }[]) => rows.map((row) => row.id).sort();
    const all = await inRequest(x, () => query.list({ search: word.toLowerCase(), limit: 50 }));
    expect(ids(all)).toEqual(ids([byName, byCode, byBrand]));
    const active = await inRequest(x, () => query.list({ search: word, status: 'active', limit: 50 }));
    expect(ids(active)).toEqual(ids([byName, byCode]));
  });

  it('a search with % or _ matches them literally, not as wildcards', async () => {
    const word = `W${tag()}`;
    await inRequest(x, () => query.create(product({ name: `${word} 100% cotton` })));
    expect(await inRequest(x, () => query.list({ search: `${word} 1_0`, limit: 50 }))).toEqual([]);
    expect(await inRequest(x, () => query.list({ search: `${word} 100%`, limit: 50 }))).toHaveLength(1);
  });

  it('pages by id: limit, then after the last id', async () => {
    const word = `Pg${tag()}`;
    const made = await inRequest(x, async () => {
      const rows = [];
      for (let i = 0; i < 3; i += 1) rows.push(await query.create(product({ name: `${word} ${i}` })));
      return rows;
    });
    const first = await inRequest(x, () => query.list({ search: word, limit: 2 }));
    const second = await inRequest(x, () => query.list({ search: word, limit: 2, afterId: first[1]?.id }));
    expect([...first, ...second].map((row) => row.id)).toEqual(made.map((row) => row.id));
  });
});

describe('ProductQuery.edit (the optimistic version check)', () => {
  it('with the current version: applies the changes and raises the version', async () => {
    const created = await inRequest(x, () => query.create(product()));
    const edited = await inRequest(x, () =>
      query.edit(created.id, 1, { name: 'Helmet XL', sellPrice: '2600.00', status: 'archived' }),
    );
    expect(edited).toMatchObject({ name: 'Helmet XL', sellPrice: '2600.00', status: 'archived', version: 2 });
    expect(edited?.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());
  });

  it('with a stale version: returns null and changes nothing', async () => {
    const created = await inRequest(x, () => query.create(product()));
    await inRequest(x, () => query.edit(created.id, 1, { name: 'First edit' }));
    expect(await inRequest(x, () => query.edit(created.id, 1, { name: 'Stale edit' }))).toBeNull();
    expect(await inRequest(x, () => query.find(created.id))).toMatchObject({
      name: 'First edit',
      version: 2,
    });
  });

  it("from business Y on X's product: returns null and changes nothing", async () => {
    const created = await inRequest(x, () => query.create(product()));
    expect(await inRequest(y, () => query.edit(created.id, 1, { name: 'From Y' }))).toBeNull();
    expect(await inRequest(x, () => query.find(created.id))).toMatchObject({ name: 'Helmet', version: 1 });
  });

  it('two parallel edits of the same version: exactly one wins', async () => {
    const created = await inRequest(x, () => query.create(product()));
    const results = await Promise.all([
      inRequest(x, () => query.edit(created.id, 1, { name: 'Cashier A' })),
      inRequest(x, () => query.edit(created.id, 1, { name: 'Cashier B' })),
    ]);
    const winners = results.filter((result) => result !== null);
    expect(winners).toHaveLength(1);
    expect(await inRequest(x, () => query.find(created.id))).toMatchObject({
      name: winners[0]?.name,
      version: 2,
    });
  });
});

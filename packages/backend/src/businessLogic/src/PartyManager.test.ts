import { AppError, DEFAULT_ROLE_PERMISSIONS, type PermissionCode } from '@erp/shared';
import { describe, expect, it } from 'vitest';
import type {
  IPartyQuery,
  NewPartyRecord,
  PartyListFilter,
  PartyPhoneMatch,
  PartyRecord,
  PartyRecordChanges,
} from './contracts/IPartyQuery.js';
import { PartyManager, type PartyCreate } from './PartyManager.js';
import { FakeNumberSeries } from './test/FakeNumberSeries.js';

/** ADR 0019 tests 10, 13 and 14 and ADR 0006 test 17, over a fake Query (the real one is PartyQuery.int.test.ts). */
const ID = '0196f000-0000-7000-8000-000000000401';
const USER = '0196f000-0000-7000-8000-0000000000b1';
const BRANCH = '0196f000-0000-7000-8000-0000000000c1';
/** The cashier's codes (ADR 0006 section 8): view and create customers and suppliers, no edit or deactivate. */
const CASHIER: readonly PermissionCode[] = DEFAULT_ROLE_PERMISSIONS.cashier;
const OWNER: readonly PermissionCode[] = DEFAULT_ROLE_PERMISSIONS.owner;
const actor = { userId: USER, branchId: BRANCH, permissions: OWNER };

const record = (overrides: Partial<PartyRecord> = {}): PartyRecord => ({
  id: ID,
  businessId: '0196f000-0000-7000-8000-0000000000a1',
  code: 'C-000001',
  name: 'Rahim Uddin',
  nameBn: null,
  kind: 'person',
  isCustomer: true,
  isSupplier: false,
  phoneE164: '+8801712345678',
  altPhoneE164: null,
  email: null,
  address: null,
  area: 'Mirpur',
  creditLimit: null,
  payTermDays: null,
  status: 'active',
  isWalkIn: false,
  version: 1,
  createdAt: new Date('2026-11-24T00:00:00Z'),
  updatedAt: new Date('2026-11-24T00:00:00Z'),
  ...overrides,
});

class FakePartyQuery implements IPartyQuery {
  rows: PartyRecord[] = [];
  created: NewPartyRecord[] = [];
  edits: { id: string; version: number; changes: PartyRecordChanges }[] = [];
  lists: PartyListFilter[] = [];
  phoneLookups: { phones: string[]; exceptId: string | null }[] = [];
  matches: PartyPhoneMatch[] = [];
  async find(id: string) {
    return this.rows.find((row) => row.id === id) ?? null;
  }
  /** Like the real list: customers only, by name then id, after the cursor, up to the limit. */
  async list(filter: PartyListFilter) {
    this.lists.push(filter);
    return this.rows
      .filter((row) => row.isCustomer)
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
      .filter(
        (row) =>
          !filter.after ||
          row.name > filter.after.name ||
          (row.name === filter.after.name && row.id > filter.after.id),
      )
      .slice(0, filter.limit);
  }
  async findByPhones(phones: string[], exceptId: string | null) {
    this.phoneLookups.push({ phones, exceptId });
    return this.matches;
  }
  async create(input: NewPartyRecord) {
    this.created.push(input);
    return record({ ...input, version: 1 });
  }
  /** Like the real UPDATE … WHERE id AND version: null when the version is stale or the row isn't there. */
  async edit(id: string, version: number, changes: PartyRecordChanges) {
    this.edits.push({ id, version, changes });
    const row = this.rows.find((r) => r.id === id);
    if (!row || row.version !== version) return null;
    Object.assign(row, changes, { version: version + 1 });
    return { ...row };
  }
}

const input = (overrides: Partial<PartyCreate> = {}): PartyCreate => ({
  name: 'Rahim Uddin',
  nameBn: null,
  kind: 'person',
  isCustomer: true,
  isSupplier: false,
  phone: '01712345678',
  altPhone: null,
  email: null,
  address: null,
  area: 'Mirpur',
  creditLimit: null,
  payTermDays: null,
  ...overrides,
});

const setup = (rows: PartyRecord[] = []) => {
  const query = new FakePartyQuery();
  query.rows = rows;
  const series = new FakeNumberSeries('C-');
  // These tests never read dues (PartyManager.dues.test.ts does): a read here is a test bug.
  const unused = () => Promise.reject(new Error('dues read in a test that does not expect it'));
  const dues = { ledger: { balances: unused }, openInvoices: { openInvoices: unused } };
  return { query, series, manager: new PartyManager(query, series, dues) };
};

const errorOf = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(error instanceof AppError)) throw new Error(`expected an AppError, got ${String(error)}`);
  return { code: error.code, fields: error.fields.map((f) => `${f.path} ${f.code}`) };
};

describe('create (ADR 0019 test 10)', () => {
  it('passes no business id: a businessId or createdBy in the body is ignored, the caller is the creator', async () => {
    const { query, manager } = setup();
    const body = { ...input(), businessId: 'another-business', createdBy: 'someone-else' } as PartyCreate;
    const party = await manager.create(body, actor);
    expect(query.created).toHaveLength(1);
    expect(query.created[0]).not.toHaveProperty('businessId');
    expect(query.created[0]).toMatchObject({ createdBy: USER, createdBranchId: BRANCH });
    expect(party).toMatchObject({ id: ID, phone: '+8801712345678', status: 'active', version: 1 });
    expect(party.createdAt).toBe('2026-11-24T00:00:00.000Z');
  });

  it('stores both phones in E.164 (ADR 0019 test 14)', async () => {
    const { query, manager } = setup();
    await manager.create(input({ phone: '017 1234 5678', altPhone: '8801912345678' }), actor);
    expect(query.created[0]).toMatchObject({ phoneE164: '+8801712345678', altPhoneE164: '+8801912345678' });
  });

  it('refuses a phone that is not a Bangladesh mobile or a +country number, naming the field', async () => {
    const { query, manager } = setup();
    expect(await errorOf(manager.create(input({ phone: '0171234567' }), actor))).toEqual({
      code: 'VALIDATION_FAILED',
      fields: ['phone party.phone_invalid'],
    });
    expect(await errorOf(manager.create(input({ altPhone: '01212345678' }), actor))).toEqual({
      code: 'VALIDATION_FAILED',
      fields: ['altPhone party.phone_invalid'],
    });
    expect(query.created).toEqual([]);
  });
});

describe('edit (ADR 0019 test 13)', () => {
  it('sends the version read and only the changed fields, with phones normalised', async () => {
    const { query, manager } = setup([record()]);
    const party = await manager.edit(
      ID,
      { version: 1, name: 'Rahim Uddin Ahmed', phone: '01812345678' },
      actor,
    );
    expect(query.edits[0]).toEqual({
      id: ID,
      version: 1,
      changes: { name: 'Rahim Uddin Ahmed', phoneE164: '+8801812345678' },
    });
    expect(party).toMatchObject({ name: 'Rahim Uddin Ahmed', phone: '+8801812345678', version: 2 });
  });

  it('a stale version is 409 party.version_conflict, and the party is unchanged', async () => {
    const { query, manager } = setup([record({ version: 3 })]);
    expect(await errorOf(manager.edit(ID, { version: 2, name: 'Stale' }, actor))).toEqual({
      code: 'CONFLICT',
      fields: ['version party.version_conflict'],
    });
    expect(query.rows[0]).toMatchObject({ name: 'Rahim Uddin', version: 3 });
  });

  it('a party the request cannot see, or an id that is not a UUID, is 404 party.not_found', async () => {
    const { manager } = setup();
    for (const id of [ID, 'not-a-uuid']) {
      expect(await errorOf(manager.edit(id, { version: 1, name: 'X' }, actor))).toEqual({
        code: 'NOT_FOUND',
        fields: ['id party.not_found'],
      });
    }
  });
});

describe('the walk-in party is not edited (ADR 0059 section 3)', () => {
  it('an edit of the walk-in party is 409 party.walk_in_locked, and nothing is written', async () => {
    const { query, manager } = setup([record({ isWalkIn: true })]);
    expect(await errorOf(manager.edit(ID, { version: 1, name: 'Renamed' }, actor))).toEqual({
      code: 'CONFLICT',
      fields: ['id party.walk_in_locked'],
    });
    expect(query.edits).toEqual([]);
  });

  it('a named customer is still edited', async () => {
    const { manager } = setup([record()]);
    expect(await manager.edit(ID, { version: 1, name: 'Renamed' }, actor)).toMatchObject({ name: 'Renamed' });
  });
});

describe('deactivate (ADR 0019 test 13, ADR 0006 test 17)', () => {
  it('sets the status to inactive with the version read', async () => {
    const { query, manager } = setup([record()]);
    expect(await manager.deactivate(ID, 1)).toMatchObject({ status: 'inactive', version: 2 });
    expect(query.edits[0]?.changes).toEqual({ status: 'inactive' });
  });

  it('the walk-in party cannot be deactivated: 409 party.walk_in_locked, and nothing is written', async () => {
    const { query, manager } = setup([record({ isWalkIn: true })]);
    expect(await errorOf(manager.deactivate(ID, 1))).toEqual({
      code: 'CONFLICT',
      fields: ['id party.walk_in_locked'],
    });
    expect(query.edits).toEqual([]);
  });

  it('a stale version is 409 party.version_conflict; an unknown party is 404', async () => {
    const { manager } = setup([record({ version: 2 })]);
    expect((await errorOf(manager.deactivate(ID, 1))).fields).toEqual(['version party.version_conflict']);
    expect((await errorOf(setup().manager.deactivate(ID, 1))).fields).toEqual(['id party.not_found']);
  });
});

describe('requireActive: a deactivated party cannot be picked on a new document (ADR 0006 test 17)', () => {
  it('returns an active party', async () => {
    expect(await setup([record()]).manager.requireActive(ID)).toMatchObject({ id: ID, status: 'active' });
  });

  it('an inactive party is 409 party.inactive; an unknown one is 404', async () => {
    expect(await errorOf(setup([record({ status: 'inactive' })]).manager.requireActive(ID))).toEqual({
      code: 'CONFLICT',
      fields: ['partyId party.inactive'],
    });
    expect((await errorOf(setup().manager.requireActive(ID))).fields).toEqual(['id party.not_found']);
  });
});

describe('the code comes from the party_code series (ADR 0056 section 4)', () => {
  it('takes the business-wide number, never a code from the body', async () => {
    const { manager, series, query } = setup();
    const body = { ...input(), code: 'X-HACKED' } as PartyCreate;
    const party = await manager.create(body, actor);
    expect(series.taken).toEqual([{ kind: 'party_code', branchId: null, number: 'C-000001' }]);
    expect(query.created[0]?.code).toBe('C-000001');
    expect(party.code).toBe('C-000001');
  });
});

describe('the duplicate-phone warning (ADR 0019 test 11, ADR 0056 section 3)', () => {
  const match = { id: '0196f000-0000-7000-8000-000000000402', code: 'C-000007', name: 'Sample Customer' };

  it('a phone already on an active party is 409, one field error per match, and nothing is created', async () => {
    const { manager, query, series } = setup();
    query.matches = [
      { ...match, phoneE164: '+8801712345678', altPhoneE164: null },
      {
        ...match,
        id: '0196f000-0000-7000-8000-000000000403',
        code: 'C-000009',
        name: 'Other Customer',
        phoneE164: '+8801500000000',
        altPhoneE164: '+8801712345678',
      },
    ];
    const error = await manager.create(input(), actor).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('CONFLICT');
    expect((error as AppError).fields).toEqual([
      { path: 'phone', code: 'party.possible_duplicate', message: 'C-000007 Sample Customer' },
      { path: 'phone', code: 'party.possible_duplicate', message: 'C-000009 Other Customer' },
    ]);
    expect(query.created).toEqual([]);
    expect(series.taken).toEqual([]);
  });

  it('checks both phones, in E.164, and names the field that matched', async () => {
    const { manager, query } = setup();
    query.matches = [{ ...match, phoneE164: '+8801900000000', altPhoneE164: '+8801912345678' }];
    const fields = (await errorOf(manager.create(input({ altPhone: '01912345678' }), actor))).fields;
    expect(query.phoneLookups).toEqual([{ phones: ['+8801712345678', '+8801912345678'], exceptId: null }]);
    expect(fields).toEqual(['altPhone party.possible_duplicate']);
  });

  it('confirmDuplicate: true creates the party anyway', async () => {
    const { manager, query } = setup();
    query.matches = [{ ...match, phoneE164: '+8801712345678', altPhoneE164: null }];
    await expect(manager.create(input({ confirmDuplicate: true }), actor)).resolves.toMatchObject({
      code: 'C-000001',
    });
  });

  it('an edit that changes a phone is checked too, leaving the party itself out', async () => {
    const { manager, query } = setup([record()]);
    query.matches = [{ ...match, phoneE164: '+8801812345678', altPhoneE164: null }];
    expect((await errorOf(manager.edit(ID, { version: 1, phone: '01812345678' }, actor))).fields).toEqual([
      'phone party.possible_duplicate',
    ]);
    expect(query.phoneLookups).toEqual([{ phones: ['+8801812345678'], exceptId: ID }]);
    expect(query.edits).toEqual([]);
  });

  it('an edit that changes no phone does not look', async () => {
    const { manager, query } = setup([record()]);
    await manager.edit(ID, { version: 1, name: 'Renamed Customer' }, actor);
    expect(query.phoneLookups).toEqual([]);
  });
});

describe('the per-kind codes (ADR 0006 section 8, ADR 0056 section 4)', () => {
  it('a supplier needs party.supplier.create; without it, 403 and nothing is created', async () => {
    const { manager, query, series } = setup();
    const noSupplier = { ...actor, permissions: CASHIER.filter((c) => c !== 'party.supplier.create') };
    expect(await errorOf(manager.create(input({ isSupplier: true }), noSupplier))).toEqual({
      code: 'FORBIDDEN',
      fields: ['isSupplier party.supplier_forbidden'],
    });
    expect(query.created).toEqual([]);
    expect(series.taken).toEqual([]);
    await expect(
      manager.create(input({ isSupplier: true }), { ...actor, permissions: CASHIER }),
    ).resolves.toBeDefined();
  });

  it('making a customer also a supplier needs party.supplier.create too', async () => {
    const { manager, query } = setup([record()]);
    const noSupplier = { ...actor, permissions: OWNER.filter((c) => c !== 'party.supplier.create') };
    expect((await errorOf(manager.edit(ID, { version: 1, isSupplier: true }, noSupplier))).code).toBe(
      'FORBIDDEN',
    );
    expect(query.edits).toEqual([]);
  });

  it('the customer routes do not reach a supplier-only party: 404 on get, edit and deactivate', async () => {
    const supplierOnly = record({ isCustomer: false, isSupplier: true });
    const { manager } = setup([supplierOnly]);
    expect((await errorOf(manager.get(ID))).fields).toEqual(['id party.not_found']);
    expect((await errorOf(manager.edit(ID, { version: 1, name: 'X' }, actor))).fields).toEqual([
      'id party.not_found',
    ]);
    expect((await errorOf(manager.deactivate(ID, 1))).fields).toEqual(['id party.not_found']);
  });
});

describe('get and list (ADR 0056 section 4)', () => {
  it('get returns the customer; an unknown or malformed id is 404', async () => {
    const { manager } = setup([record()]);
    expect(await manager.get(ID)).toMatchObject({ id: ID, code: 'C-000001', phone: '+8801712345678' });
    expect((await errorOf(manager.get('not-a-uuid'))).fields).toEqual(['id party.not_found']);
  });

  const many = ['Babul', 'Anwar', 'Chandan'].map((name, i) =>
    record({ id: `0196f000-0000-7000-8000-00000000050${i}`, name, code: `C-00000${i + 1}` }),
  );

  it('asks for one row more than the page, and returns a cursor only when another page exists', async () => {
    const { manager, query } = setup(many);
    const first = await manager.list({ limit: 2 });
    expect(query.lists[0]).toMatchObject({ limit: 3 });
    expect(first.items.map((p) => p.name)).toEqual(['Anwar', 'Babul']);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await manager.list({ limit: 2, cursor: first.nextCursor ?? undefined });
    expect(second.items.map((p) => p.name)).toEqual(['Chandan']);
    expect(second.nextCursor).toBeNull();
  });

  it('passes the search and the filters through, and lists list-item fields only', async () => {
    const { manager, query } = setup(many);
    const page = await manager.list({ limit: 25, search: '0171', status: 'active', role: 'supplier' });
    expect(query.lists[0]).toMatchObject({ search: '0171', status: 'active', alsoSupplier: true });
    expect(Object.keys(page.items[0] ?? {}).sort()).toEqual(
      ['area', 'code', 'id', 'isCustomer', 'isSupplier', 'kind', 'name', 'nameBn', 'phone', 'status'].sort(),
    );
  });

  it('a cursor it did not make is 400 page.cursor_invalid', async () => {
    const { manager } = setup(many);
    expect((await errorOf(manager.list({ limit: 2, cursor: 'garbage' }))).fields).toEqual([
      'cursor page.cursor_invalid',
    ]);
  });
});

describe('get answers the profile shape (task 4, partyDetailSchema #47)', () => {
  it('carries the credit limit, pay terms and walk-in flag; no credit hold and no NID until those exist', async () => {
    const { manager } = setup([record({ creditLimit: '50000.00', payTermDays: 30 })]);
    expect(await manager.get(ID)).toMatchObject({
      creditLimit: '50000.00',
      payTermDays: 30,
      isWalkIn: false,
      onCreditHold: false,
      nidLast4: null,
    });
  });
});

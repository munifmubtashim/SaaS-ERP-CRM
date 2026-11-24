import { AppError } from '@erp/shared';
import { describe, expect, it } from 'vitest';
import type {
  IPartyQuery,
  NewPartyRecord,
  PartyRecord,
  PartyRecordChanges,
} from './contracts/IPartyQuery.js';
import { PartyManager, type PartyCreate } from './PartyManager.js';

/** ADR 0019 tests 10, 13 and 14 and ADR 0006 test 17, over a fake Query (the real one is PartyQuery.int.test.ts). */
const ID = '0196f000-0000-7000-8000-000000000401';
const USER = '0196f000-0000-7000-8000-0000000000b1';
const BRANCH = '0196f000-0000-7000-8000-0000000000c1';
const actor = { userId: USER, branchId: BRANCH };

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
  async find(id: string) {
    return this.rows.find((row) => row.id === id) ?? null;
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
  code: 'C-000001',
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
  return { query, manager: new PartyManager(query) };
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
    const party = await manager.edit(ID, { version: 1, name: 'Rahim Uddin Ahmed', phone: '01812345678' });
    expect(query.edits[0]).toEqual({
      id: ID,
      version: 1,
      changes: { name: 'Rahim Uddin Ahmed', phoneE164: '+8801812345678' },
    });
    expect(party).toMatchObject({ name: 'Rahim Uddin Ahmed', phone: '+8801812345678', version: 2 });
  });

  it('a stale version is 409 party.version_conflict, and the party is unchanged', async () => {
    const { query, manager } = setup([record({ version: 3 })]);
    expect(await errorOf(manager.edit(ID, { version: 2, name: 'Stale' }))).toEqual({
      code: 'CONFLICT',
      fields: ['version party.version_conflict'],
    });
    expect(query.rows[0]).toMatchObject({ name: 'Rahim Uddin', version: 3 });
  });

  it('a party the request cannot see, or an id that is not a UUID, is 404 party.not_found', async () => {
    const { manager } = setup();
    for (const id of [ID, 'not-a-uuid']) {
      expect(await errorOf(manager.edit(id, { version: 1, name: 'X' }))).toEqual({
        code: 'NOT_FOUND',
        fields: ['id party.not_found'],
      });
    }
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

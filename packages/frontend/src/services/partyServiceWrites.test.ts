import { partySchema, type CreatePartyInput } from '@erp/shared';
import type { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { ApiRequestError, type IHttpClient, type IHttpPatch } from './HttpClient';
import { MockPartyService } from './mock/MockPartyService';
import { PartyService, PartyServiceSwitch, type IPartyService } from './partyService';

/** Task 4 T3: adding and editing a customer (POST and PATCH /v1/parties, ADR 0056). Every value is invented. */
const BIZ = '0196f000-0000-7000-8000-0000000000a1';
const newCustomer: CreatePartyInput = {
  name: 'Sample New Customer',
  nameBn: null,
  kind: 'person',
  isCustomer: true,
  isSupplier: false,
  phone: '01700000099',
  altPhone: null,
  email: null,
  address: 'Notun Para, Savar, Dhaka',
  area: 'Savar',
  creditLimit: null,
  payTermDays: null,
};

class RecordingHttp implements IHttpClient, IHttpPatch {
  calls: { method: string; path: string; body: unknown; schema: z.ZodType }[] = [];
  getJson = () => Promise.reject(new Error('unused'));
  post = () => Promise.reject(new Error('unused'));
  postJson = <T extends z.ZodType>(path: string, body: unknown, schema: T) => {
    this.calls.push({ method: 'POST', path, body, schema });
    return Promise.reject(new Error('no API in this test'));
  };
  patchJson = <T extends z.ZodType>(path: string, body: unknown, schema: T) => {
    this.calls.push({ method: 'PATCH', path, body, schema });
    return Promise.reject(new Error('no API in this test'));
  };
}

describe('PartyService writes (the API)', () => {
  it('creates with POST /v1/parties and edits with PATCH /v1/parties/:id, both answered as partySchema', async () => {
    const http = new RecordingHttp();
    const api = new PartyService(http);
    await api.create(newCustomer).catch(() => undefined);
    await api.update('p 1', { version: 2, name: 'Renamed' }).catch(() => undefined);
    expect(http.calls).toEqual([
      { method: 'POST', path: '/v1/parties', body: newCustomer, schema: partySchema },
      {
        method: 'PATCH',
        path: '/v1/parties/p%201',
        body: { version: 2, name: 'Renamed' },
        schema: partySchema,
      },
    ]);
  });

  it('the switch sends create and update where list and get go (key party)', async () => {
    const real = new PartyService(new RecordingHttp());
    const calls: string[] = [];
    const sample = {
      create: () => (calls.push('sample'), Promise.reject(new Error('x'))),
    } as unknown as IPartyService;
    const party = new PartyServiceSwitch(real, sample, (call) => call !== 'dues' && call !== 'list');
    await party.create(newCustomer).catch(() => undefined);
    expect(calls).toEqual(['sample']);
  });
});

describe('MockPartyService writes (the sample, behaving like the API)', () => {
  const sample = () => new MockPartyService(() => BIZ, 0);
  const errorOf = (p: Promise<unknown>) =>
    p.then(
      () => null,
      (e: unknown) => e as ApiRequestError,
    );

  it('creates a customer with the next C- code, phone in E.164, and lists it', async () => {
    const mock = sample();
    const created = await mock.create(newCustomer);
    expect(created).toMatchObject({
      name: 'Sample New Customer',
      phone: '+8801700000099',
      version: 1,
      status: 'active',
    });
    expect(created.code).toMatch(/^C-\d{4,6}$/);
    const page = await mock.list({ search: 'Sample New' });
    expect(page.items.map((p) => p.id)).toContain(created.id);
  });

  it('a phone another customer has is 409 party.possible_duplicate naming them; confirmDuplicate saves', async () => {
    const mock = sample();
    const first = await mock.create(newCustomer);
    const error = await errorOf(mock.create({ ...newCustomer, name: 'Another Customer' }));
    expect(error?.status).toBe(409);
    expect(error?.body?.fields).toEqual([
      { path: 'phone', code: 'party.possible_duplicate', message: `${first.code} Sample New Customer` },
    ]);
    await expect(
      mock.create({ ...newCustomer, name: 'Another Customer', confirmDuplicate: true }),
    ).resolves.toBeDefined();
  });

  it('an edit with the version read bumps it; a stale version is 409 party.version_conflict', async () => {
    const mock = sample();
    const created = await mock.create({ ...newCustomer, phone: '01700000098' });
    const edited = await mock.update(created.id, { version: 1, name: 'Renamed Customer' });
    expect(edited).toMatchObject({ name: 'Renamed Customer', version: 2 });
    const stale = await errorOf(mock.update(created.id, { version: 1, name: 'Stale' }));
    expect(stale?.status).toBe(409);
    expect(stale?.body?.fields[0]?.code).toBe('party.version_conflict');
  });
});

import {
  partyDetailSchema,
  partyListResponseSchema,
  type PartyListItem,
  type PartyListQueryInput,
} from '@erp/shared';
import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '../HttpClient';
import { MockPartyService, SAMPLE_BUSINESS_IDS } from './MockPartyService';

const A = SAMPLE_BUSINESS_IDS.demoMotors;
const B = SAMPLE_BUSINESS_IDS.sampleTraders;
const serviceFor = (businessId: string) => new MockPartyService(() => businessId, 0);

/** Follows nextCursor to the end and returns every row, as the list screen's "Load more" does. */
async function everyRow(service: MockPartyService, query: PartyListQueryInput): Promise<PartyListItem[]> {
  const rows: PartyListItem[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 50; page++) {
    const res = await service.list({ ...query, cursor });
    rows.push(...res.items);
    if (!res.nextCursor) return rows;
    cursor = res.nextCursor;
  }
  throw new Error('paging never ended');
}

describe('MockPartyService (stands in for GET /v1/parties until F2)', () => {
  it('answers in the shared list shape, 25 rows by default, with a cursor to the next page', async () => {
    const page = await serviceFor(A).list({ role: 'customer' });
    expect(partyListResponseSchema.safeParse(page).success).toBe(true);
    expect(page.items).toHaveLength(25);
    expect(page.nextCursor).not.toBeNull();
  });

  it('pages through every customer once, and lists no supplier-only party', async () => {
    const rows = await everyRow(serviceFor(A), { role: 'customer', limit: 10 });
    expect(rows.length).toBeGreaterThan(25);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    expect(rows.every((r) => r.isCustomer)).toBe(true);
  });

  it('finds a customer by name (any case), by Bangla name, by code and by phone digits', async () => {
    const service = serviceFor(A);
    const [first] = (await service.list({ role: 'customer', limit: 1 })).items;
    if (!first?.nameBn) throw new Error('no sample customer with a Bangla name');

    const byName = await service.list({ role: 'customer', search: first.name.toUpperCase() });
    expect(byName.items.map((r) => r.id)).toContain(first.id);

    const byNameBn = await service.list({ role: 'customer', search: first.nameBn });
    expect(byNameBn.items.map((r) => r.id)).toContain(first.id);

    const byCode = await service.list({ role: 'customer', search: first.code });
    expect(byCode.items.map((r) => r.id)).toEqual([first.id]);

    // Typed the local way (017…), stored in E.164 (+88017…).
    const localPhone = `0${first.phone.slice(4)}`;
    const byPhone = await service.list({ role: 'customer', search: localPhone });
    expect(byPhone.items.map((r) => r.id)).toEqual([first.id]);
  });

  it('returns an empty page for a search that matches nothing', async () => {
    const page = await serviceFor(A).list({ role: 'customer', search: 'no such customer' });
    expect(page).toEqual({ items: [], nextCursor: null });
  });

  it('filters by status', async () => {
    const inactive = await everyRow(serviceFor(A), { role: 'customer', status: 'inactive' });
    expect(inactive.length).toBeGreaterThan(0);
    expect(inactive.every((r) => r.status === 'inactive')).toBe(true);
  });

  it("each business sees only its own customers (the API's tenant scope, ADR 0007)", async () => {
    const inA = await everyRow(serviceFor(A), { role: 'customer' });
    const inB = await everyRow(serviceFor(B), { role: 'customer' });
    expect(inB.length).toBeGreaterThan(0);
    const idsInA = new Set(inA.map((r) => r.id));
    expect(inB.some((r) => idsInA.has(r.id))).toBe(false);
  });

  it('refuses a cursor it did not issue, as the API does', async () => {
    await expect(serviceFor(A).list({ role: 'customer', cursor: 'not-a-cursor' })).rejects.toMatchObject({
      status: 400,
      body: { code: 'VALIDATION_FAILED' },
    });
    await expect(serviceFor(A).list({ role: 'customer', cursor: 'not-a-cursor' })).rejects.toBeInstanceOf(
      ApiRequestError,
    );
  });
});

describe('MockPartyService.get (stands in for GET /v1/parties/:id until F2)', () => {
  it('answers in the shared profile shape for a customer of the active business', async () => {
    const [row] = (await serviceFor(A).list({ role: 'customer' })).items;
    const detail = await serviceFor(A).get(row?.id ?? '');
    expect(partyDetailSchema.safeParse(detail).success).toBe(true);
    expect(detail).toMatchObject({ id: row?.id, code: row?.code, name: row?.name, businessId: A });
  });

  it('answers 404 for a customer of another business, like the tenant scope', async () => {
    const [row] = (await serviceFor(A).list({ role: 'customer' })).items;
    await expect(serviceFor(B).get(row?.id ?? '')).rejects.toMatchObject({ status: 404 });
    await expect(serviceFor(A).get('0196f000-0000-7000-8000-00000000ffff')).rejects.toMatchObject({
      status: 404,
    });
  });
});

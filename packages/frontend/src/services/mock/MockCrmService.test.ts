import { followUpListResponseSchema } from '@erp/shared';
import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '../HttpClient';
import { MOCK_WALK_IN_PARTY_ID, MockCrmService } from './MockCrmService';

const mock = new MockCrmService(0);

describe('MockCrmService (stands in for GET /v1/follow-ups)', () => {
  it('answers in the shape the API will, newest first', async () => {
    const page = followUpListResponseSchema.parse(await mock.listFollowUps({ limit: 100 }));
    const times = page.items.map((r) => r.contactedAt);
    expect(times).toEqual([...times].sort().reverse());
    expect(page.nextCursor).toBeNull();
  });

  it('filters by promise status and by customer', async () => {
    const broken = await mock.listFollowUps({ promiseStatus: 'broken', limit: 100 });
    expect(broken.items.length).toBeGreaterThan(0);
    expect(broken.items.every((r) => r.promise?.status === 'broken')).toBe(true);

    const partyId = broken.items[0]?.partyId ?? '';
    const own = await mock.listFollowUps({ partyId, limit: 100 });
    expect(own.items.every((r) => r.partyId === partyId)).toBe(true);
  });

  it('pages with an opaque cursor and refuses an unknown one', async () => {
    const first = await mock.listFollowUps({ limit: 2 });
    const second = await mock.listFollowUps({ limit: 2, cursor: first.nextCursor ?? undefined });
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
    await expect(mock.listFollowUps({ cursor: 'nonsense' })).rejects.toBeInstanceOf(ApiRequestError);
  });
});

describe('MockCrmService.recordFollowUp (the rules of #137, with its stable codes)', () => {
  // 23 Nov 2026, 20:30 UTC is already 24 Nov in Dhaka.
  const fresh = () => new MockCrmService(0, () => new Date('2026-11-23T20:30:00Z'));
  const party = '0196f000-0000-7000-8000-000000c00001';
  const input = {
    partyId: party,
    collectorId: '0196f000-0000-7000-8000-000000d00001',
    channel: 'call' as const,
    outcome: 'promised' as const,
    promise: { promisedOn: '2026-11-24', amount: '05000.00' },
    note: null,
  };
  const refusal = (p: Promise<unknown>) =>
    p.then(
      () => {
        throw new Error('expected a refusal');
      },
      (e: unknown) => {
        if (!(e instanceof ApiRequestError)) throw e;
        return { status: e.status, codes: e.body?.fields.map((f) => `${f.path}:${f.code}`) };
      },
    );

  it("records an open promise for today in Dhaka, with the collector's name, at the top of the list", async () => {
    const mock = fresh();
    const saved = await mock.recordFollowUp(input);
    expect(saved).toMatchObject({ partyId: party, promise: { amount: '5000.00', status: 'open' } });
    const first = (await mock.listFollowUps({ limit: 1 })).items[0];
    expect(first).toMatchObject({
      id: saved.id,
      partyName: 'Md. Rafiqul Hossain',
      collectorName: 'Sohel Rana',
    });
  });

  it('refuses a promise dated before today in Dhaka', async () => {
    const promise = { promisedOn: '2026-11-23', amount: '5000.00' };
    expect(await refusal(fresh().recordFollowUp({ ...input, promise }))).toEqual({
      status: 400,
      codes: ['promise.promisedOn:followup.promise_date_past'],
    });
  });

  it("answers the schema's own refusals with their stable codes, like the API after #141", async () => {
    expect(await refusal(fresh().recordFollowUp({ ...input, promise: null }))).toEqual({
      status: 400,
      codes: ['promise:followup.promise_required'],
    });
  });

  it('refuses an unknown customer with 404 and the walk-in customer with 409', async () => {
    const unknown = '0196f000-0000-7000-8000-000000c00999';
    expect(await refusal(fresh().recordFollowUp({ ...input, partyId: unknown }))).toEqual({
      status: 404,
      codes: ['partyId:followup.party_not_found'],
    });
    expect(await refusal(fresh().recordFollowUp({ ...input, partyId: MOCK_WALK_IN_PARTY_ID }))).toEqual({
      status: 409,
      codes: ['partyId:followup.walk_in_not_allowed'],
    });
  });

  it('lists the stand-in collectors (temporary, until A4)', async () => {
    expect((await fresh().listCollectors()).items.map((c) => c.name)).toEqual(['Sohel Rana', 'Mitu Akter']);
  });
});

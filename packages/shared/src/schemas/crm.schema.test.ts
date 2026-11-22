import { describe, expect, it } from 'vitest';
import {
  followUpChannelSchema,
  followUpListQuerySchema,
  followUpListResponseSchema,
  followUpOutcomeSchema,
  followUpSchema,
  promiseStatusSchema,
  recordFollowUpSchema,
} from './crm.schema.js';

// Synthetic sample only: no real person, business or staff member.
const partyId = '0196f000-0000-7000-8000-000000000101';
const collectorId = '0196f000-0000-7000-8000-000000000501';

const promised = {
  partyId,
  collectorId,
  channel: 'call',
  outcome: 'promised',
  promise: { promisedOn: '2026-12-05', amount: '15000.00' },
  note: null,
};

const noAnswer = { ...promised, outcome: 'no_answer', promise: null };

const codesOf = (result: { error?: { issues: unknown[] } }) =>
  (result.error?.issues ?? []).map((issue) => (issue as { params?: { code?: string } }).params?.code);

describe('follow-up enums (spec CR-05)', () => {
  it('has the contact channels, the outcomes and the promise statuses, and nothing else', () => {
    expect(followUpChannelSchema.options).toEqual(['call', 'visit', 'message']);
    expect(followUpOutcomeSchema.options).toEqual(['promised', 'no_answer', 'refused', 'paid', 'other']);
    expect(promiseStatusSchema.options).toEqual(['open', 'kept', 'broken']);
  });
});

describe('recordFollowUpSchema (POST /v1/follow-ups body)', () => {
  it('accepts a call where the customer promised to pay, with the date and amount', () => {
    expect(recordFollowUpSchema.safeParse(promised).success).toBe(true);
  });

  it('accepts a follow-up with no promise, such as no answer', () => {
    expect(recordFollowUpSchema.safeParse(noAnswer).success).toBe(true);
  });

  it('needs the collector: spec CR-05 records who follows up', () => {
    const { collectorId: _omitted, ...withoutCollector } = promised;
    expect(recordFollowUpSchema.safeParse(withoutCollector).success).toBe(false);
  });

  it('refuses "promised" without a promise, with the stable code followup.promise_required', () => {
    const result = recordFollowUpSchema.safeParse({ ...promised, promise: null });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['promise']);
    expect(codesOf(result)).toContain('followup.promise_required');
  });

  it('refuses a promise on any other outcome, with the stable code followup.promise_not_allowed', () => {
    for (const outcome of ['no_answer', 'refused', 'paid', 'other']) {
      const result = recordFollowUpSchema.safeParse({ ...promised, outcome });
      expect(result.success).toBe(false);
      expect(codesOf(result)).toContain('followup.promise_not_allowed');
    }
  });

  it('takes the promised amount as a money string above zero (followup.amount_invalid)', () => {
    for (const amount of ['0.00', '-1.00', '15000', 'abc']) {
      const result = recordFollowUpSchema.safeParse({
        ...promised,
        promise: { ...promised.promise, amount },
      });
      expect(result.success).toBe(false);
      expect(codesOf(result)).toContain('followup.amount_invalid');
    }
    const asNumber = { ...promised, promise: { ...promised.promise, amount: 15000 } };
    expect(recordFollowUpSchema.safeParse(asNumber).success).toBe(false);
  });

  it('takes the promise date as a Dhaka business date, not a timestamp', () => {
    const withDate = (promisedOn: string) => ({ ...promised, promise: { ...promised.promise, promisedOn } });
    expect(recordFollowUpSchema.safeParse(withDate('2026-12-05T04:00:00.000Z')).success).toBe(false);
    expect(recordFollowUpSchema.safeParse(withDate('2026-02-30')).success).toBe(false);
  });

  it('trims the note and treats a blank one as no note', () => {
    expect(recordFollowUpSchema.parse({ ...noAnswer, note: '   ' }).note).toBeNull();
    expect(recordFollowUpSchema.parse({ ...noAnswer, note: ' call after Friday ' }).note).toBe(
      'call after Friday',
    );
    expect(recordFollowUpSchema.safeParse({ ...noAnswer, note: 'x'.repeat(501) }).success).toBe(false);
  });

  it('strips what the server sets: id, business, branch, status and the contact time', () => {
    const parsed = recordFollowUpSchema.parse({
      ...promised,
      id: partyId,
      businessId: partyId,
      branchId: partyId,
      contactedAt: '2026-11-22T04:00:00.000Z',
      promise: { ...promised.promise, status: 'kept' },
    });
    expect(Object.keys(parsed).sort()).toEqual([
      'channel',
      'collectorId',
      'note',
      'outcome',
      'partyId',
      'promise',
    ]);
    expect(Object.keys(parsed.promise ?? {}).sort()).toEqual(['amount', 'promisedOn']);
  });
});

describe('followUpSchema (a recorded follow-up, read back)', () => {
  const followUp = {
    id: '0196f000-0000-7000-8000-000000000601',
    partyId,
    collectorId,
    channel: 'visit',
    outcome: 'promised',
    promise: { promisedOn: '2026-12-05', amount: '15000.00', status: 'open' },
    note: null,
    contactedAt: '2026-11-22T04:00:00.000Z',
  };

  it('accepts an open, a kept and a broken promise', () => {
    for (const status of ['open', 'kept', 'broken']) {
      const parsed = followUpSchema.safeParse({ ...followUp, promise: { ...followUp.promise, status } });
      expect(parsed.success).toBe(true);
    }
  });

  it('accepts a follow-up without a promise', () => {
    expect(followUpSchema.safeParse({ ...followUp, outcome: 'refused', promise: null }).success).toBe(true);
  });

  it('takes the contact time as an ISO 8601 UTC timestamp', () => {
    expect(followUpSchema.safeParse({ ...followUp, contactedAt: '2026-11-22' }).success).toBe(false);
  });

  it('pages follow-ups with a cursor', () => {
    expect(followUpListResponseSchema.safeParse({ items: [followUp], nextCursor: null }).success).toBe(true);
  });
});

describe('followUpListQuerySchema', () => {
  it('filters by customer and by promise status, with the usual page size', () => {
    const parsed = followUpListQuerySchema.parse({ partyId, promiseStatus: 'broken', limit: '10' });
    expect(parsed).toEqual({ partyId, promiseStatus: 'broken', limit: 10 });
  });

  it('refuses an unknown promise status and a party id that is not a uuid', () => {
    expect(followUpListQuerySchema.safeParse({ promiseStatus: 'late' }).success).toBe(false);
    expect(followUpListQuerySchema.safeParse({ partyId: 'C-0001' }).success).toBe(false);
  });
});

import { AppError, followUpSchema, recordFollowUpSchema, type RecordFollowUpInput } from '@erp/shared';
import { describe, expect, it } from 'vitest';
import type { IClock } from './contracts/IClock.js';
import type { IFollowUpQuery, NewFollowUp } from './contracts/IFollowUpQuery.js';
import { FollowUpRecorder } from './FollowUpRecorder.js';

const BRANCH = '01900000-0000-7000-8000-00000000b001';
const PARTY = '01900000-0000-7000-8000-00000000c001';
const WALK_IN = '01900000-0000-7000-8000-00000000c0ff';
const OTHER_BUSINESS_PARTY = '01900000-0000-7000-8000-00000000c999';
const COLLECTOR = '01900000-0000-7000-8000-00000000d001';
const CALLER = '01900000-0000-7000-8000-00000000e001';

/** In-memory IFollowUpQuery: the parties visible in the caller's business, and the rows written. */
class FakeFollowUpQuery implements IFollowUpQuery {
  readonly rows: NewFollowUp[] = [];
  partyReads = 0;
  private readonly parties = new Map([
    [PARTY, { isWalkIn: false }],
    [WALK_IN, { isWalkIn: true }],
  ]);

  async partyForFollowUp(partyId: string) {
    this.partyReads += 1;
    return this.parties.get(partyId) ?? null;
  }

  async insertFollowUp(followUp: NewFollowUp) {
    this.rows.push(followUp);
    return { id: `01900000-0000-7000-8000-${String(this.rows.length).padStart(12, '0')}` };
  }
}

/** 23 Nov 2026, 20:30 UTC is already 24 Nov in Dhaka (UTC+6). */
const LATE_EVENING = new Date('2026-11-23T20:30:00Z');
const clockAt = (instant: Date): IClock => ({ now: () => instant });

function setup(instant = LATE_EVENING) {
  const query = new FakeFollowUpQuery();
  return { query, recorder: new FollowUpRecorder(query, clockAt(instant)) };
}

/** Parsed the way the route will parse it, so the recorder sees what it will see in production. */
const input = (overrides: Partial<RecordFollowUpInput> = {}) =>
  recordFollowUpSchema.parse({
    partyId: PARTY,
    collectorId: COLLECTOR,
    channel: 'call',
    outcome: 'promised',
    promise: { promisedOn: '2026-11-30', amount: '5000.00' },
    note: null,
    ...overrides,
  });

async function refusal(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

describe('FollowUpRecorder (CR-05)', () => {
  it('records a promise to pay as open, with the server clock and the caller, and reads back a valid follow-up', async () => {
    const { query, recorder } = setup();
    const recorded = await recorder.record(BRANCH, input(), CALLER);

    expect(query.rows).toEqual([
      {
        branchId: BRANCH,
        partyId: PARTY,
        collectorId: COLLECTOR,
        channel: 'call',
        outcome: 'promised',
        promise: { promisedOn: '2026-11-30', amount: '5000.00', status: 'open' },
        note: null,
        contactedAt: LATE_EVENING,
        createdBy: CALLER,
      },
    ]);
    expect(followUpSchema.parse(recorded)).toEqual({
      id: '01900000-0000-7000-8000-000000000001',
      partyId: PARTY,
      collectorId: COLLECTOR,
      channel: 'call',
      outcome: 'promised',
      promise: { promisedOn: '2026-11-30', amount: '5000.00', status: 'open' },
      note: null,
      contactedAt: '2026-11-23T20:30:00.000Z',
    });
  });

  it('records a follow-up without a promise, with no promise status', async () => {
    const { query, recorder } = setup();
    const recorded = await recorder.record(
      BRANCH,
      input({ outcome: 'no_answer', promise: null, note: ' rang twice ' }),
      CALLER,
    );
    expect(query.rows[0]).toMatchObject({ outcome: 'no_answer', promise: null, note: 'rang twice' });
    expect(recorded.promise).toBeNull();
  });

  it('stores the promised amount in one form: "05000.00" is stored as "5000.00"', async () => {
    const { query, recorder } = setup();
    await recorder.record(
      BRANCH,
      input({ promise: { promisedOn: '2026-11-30', amount: '05000.00' } }),
      CALLER,
    );
    expect(query.rows[0]?.promise?.amount).toBe('5000.00');
  });

  it("accepts a promise for today's Dhaka date, even when it is still yesterday in UTC", async () => {
    const { query, recorder } = setup();
    await recorder.record(
      BRANCH,
      input({ promise: { promisedOn: '2026-11-24', amount: '5000.00' } }),
      CALLER,
    );
    expect(query.rows).toHaveLength(1);
  });

  it('refuses a promise dated before today in Dhaka with followup.promise_date_past, before reading the party', async () => {
    const { query, recorder } = setup();
    // 23 Nov is today in UTC but yesterday in Dhaka.
    const error = await refusal(
      recorder.record(BRANCH, input({ promise: { promisedOn: '2026-11-23', amount: '5000.00' } }), CALLER),
    );
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.fields).toEqual([
      expect.objectContaining({ path: 'promise.promisedOn', code: 'followup.promise_date_past' }),
    ]);
    expect(query.partyReads).toBe(0);
    expect(query.rows).toEqual([]);
  });

  it('refuses the walk-in customer with followup.walk_in_not_allowed (ADR 0006: no dues to follow up)', async () => {
    const { query, recorder } = setup();
    const error = await refusal(recorder.record(BRANCH, input({ partyId: WALK_IN }), CALLER));
    expect(error.code).toBe('CONFLICT');
    expect(error.fields).toEqual([
      expect.objectContaining({ path: 'partyId', code: 'followup.walk_in_not_allowed' }),
    ]);
    expect(query.rows).toEqual([]);
  });

  it('answers a party outside the caller’s business with 404 followup.party_not_found, the same as an unknown id', async () => {
    const { query, recorder } = setup();
    const error = await refusal(recorder.record(BRANCH, input({ partyId: OTHER_BUSINESS_PARTY }), CALLER));
    expect(error.code).toBe('NOT_FOUND');
    expect(error.fields).toEqual([
      expect.objectContaining({ path: 'partyId', code: 'followup.party_not_found' }),
    ]);
    expect(query.rows).toEqual([]);
  });
});

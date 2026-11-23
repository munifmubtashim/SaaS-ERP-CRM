import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '../../services';
import { EMPTY_FORM, followUpResolver, fromServerError, type FollowUpFormValues } from './followUpForm';

const PARTY = '0196f000-0000-7000-8000-000000c00001';
const COLLECTOR = '0196f000-0000-7000-8000-000000d00001';

const promised: FollowUpFormValues = {
  ...EMPTY_FORM,
  collectorId: COLLECTOR,
  channel: 'call',
  outcome: 'promised',
  promisedOn: '2026-11-30',
  amount: '5000.00',
};

const resolve = (values: FollowUpFormValues) =>
  // The resolver ignores RHF's context and options; the form passes them through unchanged.
  followUpResolver(PARTY)(values, undefined, { fields: {}, shouldUseNativeValidation: false });

const rejection = (status: number, fields: { path: string; code: string }[]) =>
  new ApiRequestError(status, {
    code: status === 400 ? 'VALIDATION_FAILED' : status === 404 ? 'NOT_FOUND' : 'CONFLICT',
    message: 'refused',
    fields: fields.map((f) => ({ ...f, message: 'refused' })),
    requestId: 'test',
  });

describe('followUpResolver: the shared schema, with its stable codes on the form fields', () => {
  it('turns a promised follow-up into the POST body', async () => {
    expect((await resolve(promised)).values).toEqual({
      partyId: PARTY,
      collectorId: COLLECTOR,
      channel: 'call',
      outcome: 'promised',
      promise: { promisedOn: '2026-11-30', amount: '5000.00' },
      note: null,
    });
  });

  it('sends no promise for any other outcome, even if the hidden fields still hold values', async () => {
    const { values } = await resolve({ ...promised, outcome: 'no_answer', note: ' rang twice ' });
    expect(values).toMatchObject({ outcome: 'no_answer', promise: null, note: 'rang twice' });
  });

  it('puts followup.promise_required on the date when a promise has no date', async () => {
    const { errors } = await resolve({ ...promised, promisedOn: '' });
    expect(errors.promisedOn?.type).toBe('followup.promise_required');
  });

  it('puts followup.amount_invalid on the amount for zero or a number without two decimals', async () => {
    for (const amount of ['0.00', '5000']) {
      expect((await resolve({ ...promised, amount })).errors.amount?.type).toBe('followup.amount_invalid');
    }
  });

  it('asks for a missing promise at once, even while other fields are still empty', async () => {
    const { errors } = await resolve({ ...EMPTY_FORM, outcome: 'promised' });
    expect(errors.promisedOn?.type).toBe('followup.promise_required');
  });

  it('asks for the collector, channel and outcome', async () => {
    const { errors } = await resolve({ ...EMPTY_FORM });
    expect(Object.keys(errors).sort()).toEqual(['channel', 'collectorId', 'outcome']);
  });
});

describe('fromServerError: the API (and the mock) answer with the codes from #137', () => {
  it('puts a past promise date under the date field', () => {
    expect(
      fromServerError(rejection(400, [{ path: 'promise.promisedOn', code: 'followup.promise_date_past' }])),
    ).toEqual({ fields: [{ name: 'promisedOn', code: 'followup.promise_date_past' }], banner: null });
  });

  it('shows an unknown customer and the walk-in customer as a banner, not a field', () => {
    expect(fromServerError(rejection(404, [{ path: 'partyId', code: 'followup.party_not_found' }]))).toEqual({
      fields: [],
      banner: 'followUps.form.error.followup.party_not_found',
    });
    expect(
      fromServerError(rejection(409, [{ path: 'partyId', code: 'followup.walk_in_not_allowed' }])),
    ).toEqual({
      fields: [],
      banner: 'followUps.form.error.followup.walk_in_not_allowed',
    });
  });

  it('answers a 403 with the permission message and anything else with the generic one', () => {
    expect(fromServerError(rejection(403, [])).banner).toBe('followUps.form.forbidden');
    expect(fromServerError(new Error('network down')).banner).toBe('followUps.form.error.generic');
  });
});

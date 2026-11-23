import {
  recordFollowUpSchema,
  type FollowUpChannel,
  type FollowUpOutcome,
  type RecordFollowUp,
  type RecordFollowUpInput,
} from '@erp/shared';
import type { FieldErrors, Resolver } from 'react-hook-form';
import type { MessageKey } from '../../i18n';
import { ApiRequestError } from '../../services';

/** The form's own flat fields; the promise fields only count when the outcome is "promised". */
export interface FollowUpFormValues {
  collectorId: string;
  channel: FollowUpChannel | '';
  outcome: FollowUpOutcome | '';
  promisedOn: string;
  amount: string;
  note: string;
}

export const EMPTY_FORM: FollowUpFormValues = {
  collectorId: '',
  channel: '',
  outcome: '',
  promisedOn: '',
  amount: '',
  note: '',
};

type FieldName = keyof FollowUpFormValues;

/** Where an issue's path (from the schema or the API's fields[]) shows on this form. Null = a banner. */
function fieldOf(path: string): FieldName | null {
  if (path === 'promise' || path === 'promise.promisedOn') return 'promisedOn';
  if (path === 'promise.amount') return 'amount';
  if (path === 'collectorId' || path === 'channel' || path === 'outcome' || path === 'note') return path;
  return null;
}

/** Codes with their own message; any other refusal on a field asks for that field again. */
const KNOWN_CODES = [
  'followup.promise_required',
  'followup.amount_invalid',
  'followup.promise_date_past',
  'followup.party_not_found',
  'followup.walk_in_not_allowed',
] as const;
type KnownCode = (typeof KNOWN_CODES)[number];
const isKnown = (code: string): code is KnownCode => (KNOWN_CODES as readonly string[]).includes(code);

export function messageKeyFor(code: string): MessageKey {
  return isKnown(code) ? `followUps.form.error.${code}` : 'followUps.form.error.required';
}

function toInput(values: FollowUpFormValues, partyId: string): RecordFollowUpInput {
  return {
    partyId,
    collectorId: values.collectorId,
    channel: values.channel as FollowUpChannel,
    outcome: values.outcome as FollowUpOutcome,
    promise: values.outcome === 'promised' ? { promisedOn: values.promisedOn, amount: values.amount } : null,
    note: values.note,
  };
}

/**
 * Validates with the shared recordFollowUpSchema. A refine's stable code (`params.code`) becomes the error's
 * type, so the message comes from the same code the API sends (#141); the first stable code on a field wins.
 */
export function followUpResolver(partyId: string): Resolver<FollowUpFormValues, unknown, RecordFollowUp> {
  return async (values) => {
    const input = toInput(values, partyId);
    // An empty date would fail as "not a date"; for a promise without one, the stable code is promise_required.
    if (input.promise && input.promise.promisedOn === '') input.promise = null;
    const result = recordFollowUpSchema.safeParse(input);
    if (result.success) return { values: result.data, errors: {} };

    const errors: FieldErrors<FollowUpFormValues> = {};
    for (const issue of result.error.issues) {
      const name = fieldOf(issue.path.map(String).join('.'));
      if (!name) continue;
      const params = issue.code === 'custom' ? (issue.params as { code?: unknown } | undefined) : undefined;
      const code = typeof params?.code === 'string' ? params.code : issue.code;
      if (!errors[name] || (isKnown(code) && !isKnown(String(errors[name].type)))) {
        errors[name] = { type: code, message: code };
      }
    }
    // Zod skips the schema's object-level check (outcome vs promise) while another field is invalid, so the form
    // asks for a missing promise at once instead of after the other fields are fixed. Same code as the schema.
    if (values.outcome === 'promised' && (!values.promisedOn || !values.amount) && !errors.promisedOn) {
      errors.promisedOn = { type: 'followup.promise_required', message: 'followup.promise_required' };
    }
    return { values: {}, errors };
  };
}

export interface ServerRefusal {
  fields: { name: FieldName; code: string }[];
  banner: MessageKey | null;
}

/** Splits an API refusal into field errors and one banner (unknown customer, walk-in, permission, other). */
export function fromServerError(error: unknown): ServerRefusal {
  if (!(error instanceof ApiRequestError)) return { fields: [], banner: 'followUps.form.error.generic' };
  if (error.status === 403) return { fields: [], banner: 'followUps.form.forbidden' };
  const fields: ServerRefusal['fields'] = [];
  let banner: MessageKey | null = null;
  for (const field of error.body?.fields ?? []) {
    const name = fieldOf(field.path);
    if (name) fields.push({ name, code: field.code });
    else banner ??= isKnown(field.code) ? messageKeyFor(field.code) : 'followUps.form.error.generic';
  }
  if (fields.length === 0 && !banner) banner = 'followUps.form.error.generic';
  return { fields, banner };
}

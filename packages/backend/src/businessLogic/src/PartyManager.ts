import { AppError, toE164, type Party } from '@erp/shared';
import type {
  IPartyQuery,
  NewPartyRecord,
  PartyRecord,
  PartyRecordChanges,
} from './contracts/IPartyQuery.js';

/** What a create carries: phones as typed. No business id, creator or branch: those come from the request. */
export type PartyCreate = Omit<
  NewPartyRecord,
  'phoneE164' | 'altPhoneE164' | 'createdBranchId' | 'createdBy'
> & {
  phone: string;
  altPhone: string | null;
};

/** An edit: the version read and the changed fields. The code never changes; status only through deactivate. */
export type PartyEdit = { version: number } & Partial<Omit<PartyCreate, 'code'>>;

/** Who is asking: the logged-in user and the request's branch (ADR 0019 section 5). */
export interface PartyActor {
  userId: string;
  branchId: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The stored fields an edit may carry, picked one by one so nothing else in the body reaches the Query. */
const EDIT_FIELDS = [
  'name',
  'nameBn',
  'kind',
  'isCustomer',
  'isSupplier',
  'email',
  'address',
  'area',
] as const;
const LIMIT_FIELDS = ['creditLimit', 'payTermDays'] as const;

const ERRORS = {
  'party.not_found': ['NOT_FOUND', 'id', 'Customer or supplier not found.'],
  'party.phone_invalid': ['VALIDATION_FAILED', 'phone', 'Enter a Bangladesh mobile number or +country code.'],
  'party.version_conflict': ['CONFLICT', 'version', 'Changed by someone else. Reload and try again.'],
  'party.walk_in_locked': ['CONFLICT', 'id', 'The walk-in customer cannot be deactivated.'],
  'party.inactive': ['CONFLICT', 'partyId', 'This customer or supplier is inactive.'],
} as const;

function fail(field: keyof typeof ERRORS, path?: string): AppError {
  const [code, defaultPath, message] = ERRORS[field];
  return new AppError(code, message, [{ path: path ?? defaultPath, code: field, message }]);
}

/** A phone as E.164, or a 400 naming the field. */
function e164(value: string, path: 'phone' | 'altPhone'): string {
  const phone = toE164(value);
  if (!phone) throw fail('party.phone_invalid', path);
  return phone;
}

function changesOf(edit: Partial<Omit<PartyCreate, 'code'>>): PartyRecordChanges {
  const changes: PartyRecordChanges = {};
  for (const field of [...EDIT_FIELDS, ...LIMIT_FIELDS]) {
    if (edit[field] !== undefined) Object.assign(changes, { [field]: edit[field] });
  }
  if (edit.phone !== undefined) changes.phoneE164 = e164(edit.phone, 'phone');
  if (edit.altPhone !== undefined) {
    changes.altPhoneE164 = edit.altPhone === null ? null : e164(edit.altPhone, 'altPhone');
  }
  return changes;
}

/** The shared Party shape: no NID, dates as ISO strings. */
function toParty(row: PartyRecord): Party {
  return {
    id: row.id,
    businessId: row.businessId,
    code: row.code,
    name: row.name,
    nameBn: row.nameBn,
    kind: row.kind,
    isCustomer: row.isCustomer,
    isSupplier: row.isSupplier,
    phone: row.phoneE164,
    altPhone: row.altPhoneE164,
    email: row.email,
    address: row.address,
    area: row.area,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
  };
}

/**
 * Party module: business rules (ADR 0019 section 5). No Express, no SQL. Owner: Farhan. Runs inside the request's
 * tenant transaction; the business is the scope's one business, set by the Query and RLS, never by the caller.
 * Not here yet: the duplicate-phone warning (#52), the code series (#54 question 1), ensureWalkIn() and the list.
 */
export class PartyManager {
  constructor(private readonly query: IPartyQuery) {}

  async create(input: PartyCreate, actor: PartyActor): Promise<Party> {
    const row = await this.query.create({
      code: input.code,
      name: input.name,
      nameBn: input.nameBn,
      kind: input.kind,
      isCustomer: input.isCustomer,
      isSupplier: input.isSupplier,
      phoneE164: e164(input.phone, 'phone'),
      altPhoneE164: input.altPhone === null ? null : e164(input.altPhone, 'altPhone'),
      email: input.email,
      address: input.address,
      area: input.area,
      creditLimit: input.creditLimit,
      payTermDays: input.payTermDays,
      createdBranchId: actor.branchId,
      createdBy: actor.userId,
    });
    return toParty(row);
  }

  async edit(id: string, edit: PartyEdit): Promise<Party> {
    if (!UUID.test(id)) throw fail('party.not_found');
    return toParty(await this.write(id, edit.version, changesOf(edit)));
  }

  /** ADR 0006 section 6: the walk-in party is never deactivated. */
  async deactivate(id: string, version: number): Promise<Party> {
    const row = UUID.test(id) ? await this.query.find(id) : null;
    if (!row) throw fail('party.not_found');
    if (row.isWalkIn) throw fail('party.walk_in_locked');
    return toParty(await this.write(id, version, { status: 'inactive' }));
  }

  /** For a new document (ADR 0006 test 17): a deactivated party can't be picked. */
  async requireActive(id: string): Promise<Party> {
    const row = UUID.test(id) ? await this.query.find(id) : null;
    if (!row) throw fail('party.not_found');
    if (row.status !== 'active') throw fail('party.inactive');
    return toParty(row);
  }

  /** The version check: no row matched, so the party changed since it was read (409) or isn't visible (404). */
  private async write(id: string, version: number, changes: PartyRecordChanges): Promise<PartyRecord> {
    const edited = await this.query.edit(id, version, changes);
    if (edited) return edited;
    if (!(await this.query.find(id))) throw fail('party.not_found');
    throw fail('party.version_conflict');
  }
}

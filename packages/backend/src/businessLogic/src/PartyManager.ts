import {
  AppError,
  hasPermission,
  toE164,
  type Party,
  type PartyListItem,
  type PartyListQuery,
  type PartyListResponse,
  type PermissionCode,
} from '@erp/shared';
import type {
  IPartyQuery,
  NewPartyRecord,
  PartyPhoneMatch,
  PartyRecord,
  PartyRecordChanges,
} from './contracts/IPartyQuery.js';
import type { INumberSeries } from './contracts/provided/INumberSeries.js';

/**
 * What a create carries: phones as typed. No code (the party_code series, ADR 0056), business id, creator or branch:
 * those come from the server. `confirmDuplicate` saves despite a phone already on another party.
 */
export type PartyCreate = Omit<
  NewPartyRecord,
  'code' | 'phoneE164' | 'altPhoneE164' | 'createdBranchId' | 'createdBy'
> & {
  phone: string;
  altPhone: string | null;
  confirmDuplicate?: boolean;
};

/** An edit: the version read and the changed fields. The code never changes; status only through deactivate. */
export type PartyEdit = { version: number } & Partial<PartyCreate>;

/** Who is asking: the logged-in user, the request's branch and the codes that apply (ADR 0019 section 5). */
export interface PartyActor {
  userId: string;
  branchId: string | null;
  permissions: readonly PermissionCode[];
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
  'party.supplier_forbidden': ['FORBIDDEN', 'isSupplier', 'You may not add suppliers.'],
  'page.cursor_invalid': ['VALIDATION_FAILED', 'cursor', 'Start the list again from the first page.'],
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

/**
 * ADR 0019 section 4, ADR 0056 section 3: one field error per active party already holding one of the phones, named
 * by code and name only. 409, so the form can offer "save anyway" (confirmDuplicate).
 */
function possibleDuplicate(
  matches: PartyPhoneMatch[],
  phone: string | null,
  altPhone: string | null,
): AppError {
  const fields = matches.map((m) => {
    const onPhone = phone !== null && (m.phoneE164 === phone || m.altPhoneE164 === phone);
    const matched = onPhone || altPhone === null ? 'phone' : 'altPhone';
    return { path: matched, code: 'party.possible_duplicate', message: `${m.code} ${m.name}` };
  });
  return new AppError('CONFLICT', 'A customer or supplier with this phone already exists.', fields);
}

/** The list cursor is the last row's (name, id), opaque to the client. */
function encodeCursor(row: { name: string; id: string }): string {
  return Buffer.from(JSON.stringify([row.name, row.id]), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): { name: string; id: string } {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (Array.isArray(value) && value.length === 2) {
      const [name, id] = value as unknown[];
      if (typeof name === 'string' && typeof id === 'string' && UUID.test(id)) return { name, id };
    }
  } catch {
    // falls through to the refusal below
  }
  throw fail('page.cursor_invalid');
}

function toListItem(row: PartyRecord): PartyListItem {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    nameBn: row.nameBn,
    kind: row.kind,
    isCustomer: row.isCustomer,
    isSupplier: row.isSupplier,
    phone: row.phoneE164,
    area: row.area,
    status: row.status,
  };
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
 * The walk-in party comes from the business's trigger (ADR 0055); this Manager never creates one.
 */
export class PartyManager {
  constructor(
    private readonly query: IPartyQuery,
    private readonly numberSeries: INumberSeries,
  ) {}

  /**
   * ADR 0019 section 5, ADR 0056: a new party in the scope's one business. The kind check and the duplicate check run
   * before the code is taken, so a refusal uses up no number.
   */
  async create(input: PartyCreate, actor: PartyActor): Promise<Party> {
    if (input.isSupplier) this.requireSupplierCreate(actor);
    const phoneE164 = e164(input.phone, 'phone');
    const altPhoneE164 = input.altPhone === null ? null : e164(input.altPhone, 'altPhone');
    await this.checkDuplicates(phoneE164, altPhoneE164, null, input.confirmDuplicate);
    const row = await this.query.create({
      code: await this.numberSeries.next('party_code', null),
      name: input.name,
      nameBn: input.nameBn,
      kind: input.kind,
      isCustomer: input.isCustomer,
      isSupplier: input.isSupplier,
      phoneE164,
      altPhoneE164,
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

  /** A customer of the scope's businesses. A supplier-only party is not found through the customer routes. */
  async get(id: string): Promise<Party> {
    return toParty(await this.findCustomer(id));
  }

  /** One page of customers, by name, with an opaque cursor (one extra row says whether another page exists). */
  async list(request: Pick<PartyListQuery, 'limit'> & Partial<PartyListQuery>): Promise<PartyListResponse> {
    const after = request.cursor === undefined ? undefined : decodeCursor(request.cursor);
    const rows = await this.query.list({
      limit: request.limit + 1,
      search: request.search,
      status: request.status,
      alsoSupplier: request.role === 'supplier' ? true : undefined,
      after,
    });
    const page = rows.slice(0, request.limit);
    const last = page[page.length - 1];
    return {
      items: page.map(toListItem),
      nextCursor: rows.length > request.limit && last ? encodeCursor(last) : null,
    };
  }

  async edit(id: string, edit: PartyEdit, actor: PartyActor): Promise<Party> {
    const current = await this.findCustomer(id);
    // Adding the supplier role needs that role's create code (ADR 0006 section 8).
    if (edit.isSupplier === true && !current.isSupplier) this.requireSupplierCreate(actor);
    const changes = changesOf(edit);
    if (changes.phoneE164 !== undefined || changes.altPhoneE164 !== undefined) {
      await this.checkDuplicates(
        changes.phoneE164 ?? null,
        changes.altPhoneE164 ?? null,
        id,
        edit.confirmDuplicate,
      );
    }
    return toParty(await this.write(id, edit.version, changes));
  }

  /** ADR 0006 section 6: the walk-in party is never deactivated. */
  async deactivate(id: string, version: number): Promise<Party> {
    const row = await this.findCustomer(id);
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

  private async findCustomer(id: string): Promise<PartyRecord> {
    const row = UUID.test(id) ? await this.query.find(id) : null;
    if (!row || !row.isCustomer) throw fail('party.not_found');
    return row;
  }

  private requireSupplierCreate(actor: PartyActor): void {
    if (!hasPermission(actor.permissions, 'party.supplier.create')) throw fail('party.supplier_forbidden');
  }

  private async checkDuplicates(
    phone: string | null,
    altPhone: string | null,
    exceptId: string | null,
    confirmed = false,
  ): Promise<void> {
    if (confirmed) return;
    const phones = [phone, altPhone].filter((p): p is string => p !== null);
    const matches = await this.query.findByPhones(phones, exceptId);
    if (matches.length > 0) throw possibleDuplicate(matches, phone, altPhone);
  }

  /** The version check: no row matched, so the party changed since it was read (409) or isn't visible (404). */
  private async write(id: string, version: number, changes: PartyRecordChanges): Promise<PartyRecord> {
    const edited = await this.query.edit(id, version, changes);
    if (edited) return edited;
    if (!(await this.query.find(id))) throw fail('party.not_found');
    throw fail('party.version_conflict');
  }
}

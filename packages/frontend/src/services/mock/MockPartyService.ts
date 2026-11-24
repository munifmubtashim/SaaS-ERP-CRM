import {
  createPartySchema,
  DEFAULT_PAGE_SIZE,
  updatePartySchema,
  type CreatePartyInput,
  type Party,
  type PartyDetail,
  type PartyListItem,
  type PartyListQueryInput,
  type PartyListResponse,
  type UpdatePartyInput,
} from '@erp/shared';
import { ApiRequestError } from '../HttpClient';
import type { IPartyService } from '../partyService';

/** The two sample businesses, with the same ids as the other mock services (#12, #13). */
export const SAMPLE_BUSINESS_IDS = {
  demoMotors: '0196f000-0000-7000-8000-0000000000a1',
  sampleTraders: '0196f000-0000-7000-8000-0000000000b1',
} as const;

// Synthetic sample data only: common Bangladeshi names, Dhaka-area places, and phone numbers in a block
// (+880 1700 000xxx) that is obviously fake. Never real customers (CLAUDE.md).
const FIRST = ['Abdur', 'Md. Rafiqul', 'Nasrin', 'Shahidul', 'Farzana', 'Kamrul', 'Taslima', 'Jahangir'];
const LAST = ['Rahman', 'Islam', 'Akter', 'Hossain', 'Begum', 'Hasan', 'Khatun', 'Alam'];
const AREAS = ['Mirpur', 'Uttara', 'Savar', 'Gazipur', 'Narayanganj', 'Tongi', 'Keraniganj', null];
const COMPANIES = ['Mollah Enterprise', 'Bhai Bhai Traders', 'Rupali Auto House', 'Shapla Transport'];
// The same names in Bangla, index for index.
const FIRST_BN = ['আব্দুর', 'মো. রফিকুল', 'নাসরিন', 'শহিদুল', 'ফারজানা', 'কামরুল', 'তাসলিমা', 'জাহাঙ্গীর'];
const LAST_BN = ['রহমান', 'ইসলাম', 'আক্তার', 'হোসেন', 'বেগম', 'হাসান', 'খাতুন', 'আলম'];
const COMPANIES_BN = ['মোল্লা এন্টারপ্রাইজ', 'ভাই ভাই ট্রেডার্স', 'রূপালী অটো হাউস', 'শাপলা ট্রান্সপোর্ট'];

function sampleParty(n: number, patch: Partial<PartyListItem> = {}): PartyListItem {
  const nnn = String(n).padStart(3, '0');
  const isCompany = n % 9 === 0;
  return {
    id: `0196f000-0000-7000-8000-000000c00${nnn}`,
    code: `C-${String(n).padStart(4, '0')}`,
    name: isCompany
      ? (COMPANIES[n % COMPANIES.length] ?? 'Sample Company')
      : `${FIRST[n % FIRST.length]} ${LAST[(n * 3) % LAST.length]}`,
    // Every fifth party has no Bangla name, as many real records will not.
    nameBn:
      n % 5 === 0
        ? null
        : isCompany
          ? (COMPANIES_BN[n % COMPANIES_BN.length] ?? null)
          : `${FIRST_BN[n % FIRST_BN.length]} ${LAST_BN[(n * 3) % LAST_BN.length]}`,
    kind: isCompany ? 'company' : 'person',
    isCustomer: true,
    isSupplier: n % 11 === 0,
    phone: `+8801700000${nnn}`,
    area: AREAS[n % AREAS.length] ?? null,
    status: n % 7 === 0 ? 'inactive' : 'active',
    ...patch,
  };
}

/** Parties per business: each business sees only its own, like the API's tenant scope. */
const SAMPLE_PARTIES: Record<string, PartyListItem[]> = {
  [SAMPLE_BUSINESS_IDS.demoMotors]: [
    ...Array.from({ length: 42 }, (_, i) => sampleParty(i + 1)),
    // Suppliers only: never in the customer list.
    sampleParty(101, {
      name: 'Runner Parts Supply',
      nameBn: null,
      kind: 'company',
      isCustomer: false,
      isSupplier: true,
    }),
    sampleParty(102, {
      name: 'Padma Lubricants',
      nameBn: null,
      kind: 'company',
      isCustomer: false,
      isSupplier: true,
    }),
  ],
  [SAMPLE_BUSINESS_IDS.sampleTraders]: Array.from({ length: 5 }, (_, i) => sampleParty(201 + i)),
};

/** A sample party of this business, or undefined: the mock's tenant scope. Also used by MockSalesService. */
export function findSampleParty(businessId: string, id: string): PartyListItem | undefined {
  return (SAMPLE_PARTIES[businessId] ?? []).find((p) => p.id === id);
}

/** The sample number in a party's id (its last three digits), which seeds the other sample fields. */
export const sampleNumber = (id: string) => Number(id.slice(-3));

/** The answer the API gives for a party outside the active business: the same as for no party at all. */
export function notFound(): ApiRequestError {
  return new ApiRequestError(404, {
    code: 'NOT_FOUND',
    message: 'Not found.',
    fields: [],
    requestId: 'mock',
  });
}

/** The profile fields a list row does not carry, made up from the sample number. */
function sampleDetail(row: PartyListItem, businessId: string): PartyDetail {
  const n = sampleNumber(row.id);
  const nnn = String(n).padStart(3, '0');
  return {
    ...row,
    businessId,
    altPhone: n % 4 === 1 ? `+8801800000${nnn}` : null,
    email: null,
    address: `House ${n}, Road ${(n % 9) + 1}`,
    createdAt: '2026-10-01T04:00:00.000Z',
    updatedAt: '2026-10-01T04:00:00.000Z',
    version: 1,
    // Companies have no NID; the digits are made up and never a real NID.
    nidLast4: row.kind === 'person' ? String(1000 + ((n * 37) % 9000)) : null,
    creditLimit: n % 3 === 0 ? null : n % 3 === 1 ? '100000.00' : '250000.00',
    payTermDays: n % 3 === 0 ? null : 30,
    onCreditHold: n % 13 === 0,
    // The sample list has no walk-in party: it is a system party, not a customer the user picks.
    isWalkIn: false,
  };
}

const PHONE_LIKE = /^[\d\s+-]+$/;

/** Digits a typed phone number shares with the stored E.164 number: "01700000001" and "+8801700000001" match. */
function phoneDigits(search: string): string {
  const digits = search.replace(/\D/g, '');
  return digits.replace(/^880/, '').replace(/^0/, '');
}

/** NFC, so a Bangla name typed with a different sequence of the same characters still matches. */
const fold = (s: string) => s.normalize('NFC').toLowerCase();

function matches(row: PartyListItem, search: string): boolean {
  const text = fold(search);
  if (fold(row.name).includes(text) || fold(row.code).includes(text)) return true;
  if (row.nameBn && fold(row.nameBn).includes(text)) return true;
  if (!PHONE_LIKE.test(search)) return false;
  const digits = phoneDigits(search);
  return digits.length >= 3 && row.phone.slice('+880'.length).includes(digits);
}

const encodeCursor = (offset: number) => btoa(`p:${offset}`);

function decodeCursor(cursor: string): number {
  try {
    const match = /^p:(\d+)$/.exec(atob(cursor));
    if (match?.[1]) return Number(match[1]);
  } catch {
    // Not base64: falls through to the same refusal as any other unknown cursor.
  }
  throw new ApiRequestError(400, {
    code: 'VALIDATION_FAILED',
    message: 'Unknown cursor.',
    fields: [{ path: 'cursor', code: 'invalid_cursor', message: 'Unknown cursor.' }],
    requestId: 'mock',
  });
}

/**
 * Stands in for GET /v1/parties until F2. Answers like the API will: only the active business's parties
 * (the tenant scope, ADR 0007), search by name, Bangla name, code or phone, status and role filters, sorted by code, and
 * an opaque cursor.
 */
/** The customers' sample (list, get); the dues' sample is MockSalesService (SamplePartyService joins them). */
export class MockPartyService implements Omit<IPartyService, 'dues'> {
  constructor(
    private readonly activeBusinessId: () => string,
    private readonly delayMs = 400,
  ) {}

  /** Customers added or edited in this session, per business: the sample has no database (task 4 T3). */
  private readonly saved = new Map<string, Map<string, PartyDetail>>();

  private savedIn(businessId: string): Map<string, PartyDetail> {
    let rows = this.saved.get(businessId);
    if (!rows) {
      rows = new Map();
      this.saved.set(businessId, rows);
    }
    return rows;
  }

  /** The business's rows as the list shows them: the fixed sample with this session's additions and edits. */
  private rowsOf(businessId: string): PartyListItem[] {
    const saved = this.savedIn(businessId);
    const fixed = (SAMPLE_PARTIES[businessId] ?? []).map((r) => saved.get(r.id) ?? r);
    const added = [...saved.values()].filter((p) => !fixed.some((r) => r.id === p.id));
    return [...fixed, ...added].map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      nameBn: p.nameBn,
      kind: p.kind,
      isCustomer: p.isCustomer,
      isSupplier: p.isSupplier,
      phone: p.phone,
      area: p.area,
      status: p.status,
    }));
  }

  async list(query: PartyListQueryInput): Promise<PartyListResponse> {
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    const limit = Number(query.limit ?? DEFAULT_PAGE_SIZE);
    const start = query.cursor ? decodeCursor(query.cursor) : 0;
    const search = query.search?.trim();

    const rows = this.rowsOf(this.activeBusinessId())
      .filter((r) => query.role !== 'customer' || r.isCustomer)
      .filter((r) => query.role !== 'supplier' || r.isSupplier)
      .filter((r) => !query.status || r.status === query.status)
      .filter((r) => !search || matches(r, search))
      .sort((a, b) => a.code.localeCompare(b.code));

    const end = start + limit;
    return {
      items: rows.slice(start, end),
      nextCursor: end < rows.length ? encodeCursor(end) : null,
    };
  }

  /** Stands in for GET /v1/parties/:id: 404 for a party of another business, like the tenant scope. */
  async get(id: string): Promise<PartyDetail> {
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    const businessId = this.activeBusinessId();
    const saved = this.savedIn(businessId).get(id);
    if (saved) return saved;
    const row = findSampleParty(businessId, id);
    if (!row) throw notFound();
    return sampleDetail(row, businessId);
  }

  /** Stands in for POST /v1/parties: the API's checks on the same shared schema, and its duplicate-phone 409. */
  async create(input: CreatePartyInput): Promise<Party> {
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    const businessId = this.activeBusinessId();
    const body = createPartySchema.parse(input);
    if (!body.confirmDuplicate) this.refuseDuplicate(businessId, [body.phone, body.altPhone], null);
    const saved = this.savedIn(businessId);
    const now = new Date().toISOString();
    const party: PartyDetail = {
      id: crypto.randomUUID(),
      businessId,
      code: `C-${String(901 + saved.size).padStart(4, '0')}`,
      name: body.name,
      nameBn: body.nameBn,
      kind: body.kind,
      isCustomer: body.isCustomer,
      isSupplier: body.isSupplier,
      phone: body.phone,
      altPhone: body.altPhone,
      email: body.email,
      address: body.address,
      area: body.area,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      version: 1,
      nidLast4: null,
      creditLimit: body.creditLimit,
      payTermDays: body.payTermDays,
      onCreditHold: false,
      isWalkIn: false,
    };
    saved.set(party.id, party);
    return party;
  }

  /** Stands in for PATCH /v1/parties/:id: the version read must still be current (409 party.version_conflict). */
  async update(id: string, input: UpdatePartyInput): Promise<Party> {
    const current = await this.get(id);
    const { version, confirmDuplicate, ...changes } = updatePartySchema.parse(input);
    if (version !== current.version)
      throw conflict('version', 'party.version_conflict', 'Changed by someone else.');
    if (!confirmDuplicate && (changes.phone !== undefined || changes.altPhone !== undefined)) {
      this.refuseDuplicate(this.activeBusinessId(), [changes.phone ?? null, changes.altPhone ?? null], id);
    }
    const edited: PartyDetail = {
      ...current,
      ...Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined)),
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    this.savedIn(this.activeBusinessId()).set(id, edited);
    return edited;
  }

  /** The API's rule (ADR 0056 section 3): one field error per active party already holding one of the phones. */
  private refuseDuplicate(businessId: string, phones: (string | null)[], exceptId: string | null): void {
    const wanted = phones.filter((p): p is string => p !== null);
    const matches = this.rowsOf(businessId).filter(
      (r) => r.id !== exceptId && r.status === 'active' && wanted.includes(r.phone),
    );
    if (matches.length === 0) return;
    throw new ApiRequestError(409, {
      code: 'CONFLICT',
      message: 'A customer or supplier with this phone already exists.',
      fields: matches.map((m) => ({
        path: 'phone',
        code: 'party.possible_duplicate',
        message: `${m.code} ${m.name}`,
      })),
      requestId: 'mock',
    });
  }
}

function conflict(path: string, code: string, message: string): ApiRequestError {
  return new ApiRequestError(409, {
    code: 'CONFLICT',
    message,
    fields: [{ path, code, message }],
    requestId: 'mock',
  });
}

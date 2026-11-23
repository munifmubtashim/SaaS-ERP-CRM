import {
  businessDateInDhaka,
  DEFAULT_PAGE_SIZE,
  formatMoney,
  parseMoney,
  recordFollowUpSchema,
  type CollectorListResponse,
  type FollowUp,
  type FollowUpListItem,
  type FollowUpListQueryInput,
  type FollowUpListResponse,
  type FollowUpOutcome,
  type PromiseStatus,
  type RecordFollowUpInput,
} from '@erp/shared';
import type { ICrmService } from '../crmService';
import { ApiRequestError } from '../HttpClient';

// Synthetic sample data only: common Bangladeshi names and invented amounts. Never real customers (CLAUDE.md).
// Party ids match MockPartyService's sample customers (#33), so a customer link opens the same person.
const CUSTOMERS = [
  ['0196f000-0000-7000-8000-000000c00001', 'Md. Rafiqul Hossain'],
  ['0196f000-0000-7000-8000-000000c00002', 'Nasrin Khatun'],
  ['0196f000-0000-7000-8000-000000c00003', 'Shahidul Islam'],
  ['0196f000-0000-7000-8000-000000c00004', 'Farzana Begum'],
  ['0196f000-0000-7000-8000-000000c00006', 'Taslima Akter'],
  ['0196f000-0000-7000-8000-000000c00009', 'Bhai Bhai Traders'],
] as const;
const COLLECTORS = [
  ['0196f000-0000-7000-8000-000000d00001', 'Sohel Rana'],
  ['0196f000-0000-7000-8000-000000d00002', 'Mitu Akter'],
] as const;

type Sample = [
  customer: number,
  collector: number,
  outcome: FollowUpOutcome,
  promise: [promisedOn: string, amount: string, status: PromiseStatus] | null,
  contactedAt: string,
  note: string | null,
];

/** Newest first, as the API will sort them. */
const SAMPLES: Sample[] = [
  [0, 0, 'promised', ['2026-11-28', '18500.00', 'open'], '2026-11-23T05:10:00.000Z', 'Will pay after Friday'],
  [3, 1, 'no_answer', null, '2026-11-23T04:20:00.000Z', null],
  [1, 0, 'promised', ['2026-11-20', '42750.00', 'broken'], '2026-11-16T08:45:00.000Z', null],
  [5, 1, 'promised', ['2026-11-18', '125000.00', 'broken'], '2026-11-12T06:00:00.000Z', 'Owner travelling'],
  [2, 1, 'promised', ['2026-11-15', '9800.00', 'kept'], '2026-11-10T09:30:00.000Z', null],
  [4, 0, 'refused', null, '2026-11-09T07:15:00.000Z', 'Disputes the service charge'],
  [0, 1, 'promised', ['2026-11-05', '18500.00', 'broken'], '2026-11-01T05:00:00.000Z', null],
];

const SAMPLE_FOLLOW_UPS: FollowUpListItem[] = SAMPLES.map(
  ([customer, collector, outcome, promise, contactedAt, note], i) => {
    const [partyId, partyName] = CUSTOMERS[customer] ?? CUSTOMERS[0];
    const [collectorId, collectorName] = COLLECTORS[collector] ?? COLLECTORS[0];
    return {
      id: `0196f000-0000-7000-8000-000000f00${String(i + 1).padStart(3, '0')}`,
      partyId,
      partyName,
      collectorId,
      collectorName,
      channel: i % 3 === 0 ? 'visit' : 'call',
      outcome,
      promise: promise && { promisedOn: promise[0], amount: promise[1], status: promise[2] },
      note,
      contactedAt,
    };
  },
);

/** The business's walk-in customer in the sample data: it never has dues, so it can't be followed up (ADR 0006). */
export const MOCK_WALK_IN_PARTY_ID = '0196f000-0000-7000-8000-000000c00000';

function refuse(status: number, path: string, code: string, message: string): ApiRequestError {
  const errorCode = status === 404 ? 'NOT_FOUND' : status === 409 ? 'CONFLICT' : 'VALIDATION_FAILED';
  return new ApiRequestError(status, {
    code: errorCode,
    message,
    fields: [{ path, code, message }],
    requestId: 'mock',
  });
}

const encodeCursor = (offset: number) => btoa(`f:${offset}`);

function decodeCursor(cursor: string): number {
  try {
    const match = /^f:(\d+)$/.exec(atob(cursor));
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
 * Stands in for the follow-up routes until the follow-up table and routes exist. Answers like the API will: filters
 * by customer and promise status, newest first, an opaque cursor; recording applies #137's rules with its codes.
 * Each instance keeps its own list, so what the form records appears in the list until the page reloads.
 */
export class MockCrmService implements ICrmService {
  private readonly rows = [...SAMPLE_FOLLOW_UPS];

  constructor(
    private readonly delayMs = 400,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private wait() {
    return new Promise((resolve) => setTimeout(resolve, this.delayMs));
  }

  /** TEMPORARY, until A4's staff route: the two sample collectors. */
  async listCollectors(): Promise<CollectorListResponse> {
    await this.wait();
    return { items: COLLECTORS.map(([id, name]) => ({ id, name })) };
  }

  async recordFollowUp(input: RecordFollowUpInput): Promise<FollowUp> {
    await this.wait();
    const parsed = recordFollowUpSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const params = issue?.code === 'custom' ? (issue.params as { code?: unknown } | undefined) : undefined;
      const code = typeof params?.code === 'string' ? params.code : (issue?.code ?? 'invalid');
      throw refuse(400, issue?.path.join('.') ?? '', code, issue?.message ?? 'Invalid.');
    }
    const f = parsed.data;
    const contactedAt = this.now();
    if (f.promise && f.promise.promisedOn < businessDateInDhaka(contactedAt)) {
      throw refuse(
        400,
        'promise.promisedOn',
        'followup.promise_date_past',
        'The promise date cannot be before today.',
      );
    }
    if (f.partyId === MOCK_WALK_IN_PARTY_ID) {
      throw refuse(
        409,
        'partyId',
        'followup.walk_in_not_allowed',
        'The walk-in customer has no dues to follow up.',
      );
    }
    const customer = CUSTOMERS.find(([id]) => id === f.partyId);
    if (!customer) throw refuse(404, 'partyId', 'followup.party_not_found', 'Customer not found.');
    const collector = COLLECTORS.find(([id]) => id === f.collectorId);

    const saved: FollowUp = {
      id: `0196f000-0000-7000-8000-000000f01${String(this.rows.length).padStart(3, '0')}`,
      partyId: f.partyId,
      collectorId: f.collectorId,
      channel: f.channel,
      outcome: f.outcome,
      promise: f.promise && {
        promisedOn: f.promise.promisedOn,
        amount: formatMoney(parseMoney(f.promise.amount)),
        status: 'open',
      },
      note: f.note,
      contactedAt: contactedAt.toISOString(),
    };
    this.rows.unshift({ ...saved, partyName: customer[1], collectorName: collector?.[1] ?? '—' });
    return saved;
  }

  async listFollowUps(query: FollowUpListQueryInput): Promise<FollowUpListResponse> {
    await this.wait();
    const limit = Number(query.limit ?? DEFAULT_PAGE_SIZE);
    const start = query.cursor ? decodeCursor(query.cursor) : 0;
    const rows = this.rows
      .filter((r) => !query.partyId || r.partyId === query.partyId)
      .filter((r) => !query.promiseStatus || r.promise?.status === query.promiseStatus);
    const end = start + limit;
    return { items: rows.slice(start, end), nextCursor: end < rows.length ? encodeCursor(end) : null };
  }
}

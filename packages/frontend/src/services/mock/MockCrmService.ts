import {
  DEFAULT_PAGE_SIZE,
  type FollowUpListItem,
  type FollowUpListQueryInput,
  type FollowUpListResponse,
  type FollowUpOutcome,
  type PromiseStatus,
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
 * Stands in for GET /v1/follow-ups until the follow-up table and route exist. Answers like the API will: filters
 * by customer and promise status, newest first, an opaque cursor.
 */
export class MockCrmService implements ICrmService {
  constructor(private readonly delayMs = 400) {}

  async listFollowUps(query: FollowUpListQueryInput): Promise<FollowUpListResponse> {
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    const limit = Number(query.limit ?? DEFAULT_PAGE_SIZE);
    const start = query.cursor ? decodeCursor(query.cursor) : 0;
    const rows = SAMPLE_FOLLOW_UPS.filter((r) => !query.partyId || r.partyId === query.partyId).filter(
      (r) => !query.promiseStatus || r.promise?.status === query.promiseStatus,
    );
    const end = start + limit;
    return { items: rows.slice(start, end), nextCursor: end < rows.length ? encodeCursor(end) : null };
  }
}

import {
  collectorListResponseSchema,
  followUpListResponseSchema,
  followUpSchema,
  type CollectorListResponse,
  type FollowUp,
  type FollowUpListQueryInput,
  type FollowUpListResponse,
  type RecordFollowUpInput,
} from '@erp/shared';
import type { IHttpClient } from './HttpClient';

/** What the follow-ups screen needs from Crm. One small method per use (interface segregation). */
export interface ICrmService {
  /** One page of follow-ups in the active business, newest first. */
  listFollowUps(query: FollowUpListQueryInput): Promise<FollowUpListResponse>;
  /** Records a follow-up; refusals carry the stable codes of #137 and the shared schema. */
  recordFollowUp(input: RecordFollowUpInput): Promise<FollowUp>;
  /** TEMPORARY, until A4's staff route: who can be picked as the collector. */
  listCollectors(): Promise<CollectorListResponse>;
}

/**
 * Crm module: frontend API calls, one method per endpoint. Owner: Farhan.
 * createServices uses MockCrmService in development until GET /v1/follow-ups exists.
 * TODO(Farhan): leads, pipeline, campaigns, messaging (roadmap 5.11).
 */
export class CrmService implements ICrmService {
  constructor(protected readonly http: IHttpClient) {}

  /** GET /v1/follow-ups. Only the filters that are set go into the query string. */
  listFollowUps(query: FollowUpListQueryInput): Promise<FollowUpListResponse> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') params.set(key, String(value));
    }
    const qs = params.toString();
    return this.http.getJson(`/v1/follow-ups${qs ? `?${qs}` : ''}`, followUpListResponseSchema);
  }

  /** POST /v1/follow-ups. No Idempotency-Key: a follow-up moves no money or stock (invariant 5). */
  recordFollowUp(input: RecordFollowUpInput): Promise<FollowUp> {
    return this.http.postJson('/v1/follow-ups', input, followUpSchema);
  }

  /** GET /v1/follow-ups/collectors. TEMPORARY: replaced by the staff list once A4 exists. */
  listCollectors(): Promise<CollectorListResponse> {
    return this.http.getJson('/v1/follow-ups/collectors', collectorListResponseSchema);
  }
}

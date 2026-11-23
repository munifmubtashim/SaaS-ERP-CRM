import {
  followUpListResponseSchema,
  type FollowUpListQueryInput,
  type FollowUpListResponse,
} from '@erp/shared';
import type { IHttpClient } from './HttpClient';

/** What the follow-ups screen needs from Crm. One small method per use (interface segregation). */
export interface ICrmService {
  /** One page of follow-ups in the active business, newest first. */
  listFollowUps(query: FollowUpListQueryInput): Promise<FollowUpListResponse>;
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
}

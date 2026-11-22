import { partyListResponseSchema, type PartyListQueryInput, type PartyListResponse } from '@erp/shared';
import type { IHttpClient } from './HttpClient';

/** What the customer list needs from Party. One small method per use (interface segregation). */
export interface IPartyService {
  /** One page of parties in the active business. The HTTP client adds the business header (ADR 0007). */
  list(query: PartyListQueryInput): Promise<PartyListResponse>;
}

/**
 * Party module: frontend API calls, one method per endpoint. Owner: Farhan.
 * createServices uses MockPartyService until GET /v1/parties exists (F2).
 */
export class PartyService implements IPartyService {
  constructor(protected readonly http: IHttpClient) {}

  /** GET /v1/parties. Only the filters that are set go into the query string. */
  list(query: PartyListQueryInput): Promise<PartyListResponse> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') params.set(key, String(value));
    }
    const qs = params.toString();
    return this.http.getJson(`/v1/parties${qs ? `?${qs}` : ''}`, partyListResponseSchema);
  }
}

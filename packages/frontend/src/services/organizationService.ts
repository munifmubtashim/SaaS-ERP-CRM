import { myBusinessesResponseSchema, type MyBusinessesResponse } from '@erp/shared';
import type { IHttpClient } from './HttpClient';

/** What the business and branch switcher needs from Organization. One small method per use. */
export interface IOrganizationService {
  /** The businesses, each with its branches, that the signed-in user may work in. */
  myBusinesses(): Promise<MyBusinessesResponse>;
}

/**
 * Organization module: frontend API calls, one method per endpoint. Owner: Munif.
 * createServices uses MockOrganizationService until GET /v1/me/businesses exists (M2).
 */
export class OrganizationService implements IOrganizationService {
  constructor(protected readonly http: IHttpClient) {}

  myBusinesses(): Promise<MyBusinessesResponse> {
    return this.http.getJson('/v1/me/businesses', myBusinessesResponseSchema);
  }
}

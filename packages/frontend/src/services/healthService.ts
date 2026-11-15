import { healthResponseSchema, type HealthResponse } from '@erp/shared';
import type { IHttpClient } from './HttpClient';

export interface IHealthService {
  get(): Promise<HealthResponse>;
}

/** Reference service class: one method per endpoint, validated with the shared schema. */
export class HealthService implements IHealthService {
  constructor(private readonly http: IHttpClient) {}

  /** GET /health. A 503 still carries a valid body (database down), so it is returned, not thrown. */
  get(): Promise<HealthResponse> {
    return this.http.getJson('/health', healthResponseSchema, { allowStatuses: [503] });
  }
}

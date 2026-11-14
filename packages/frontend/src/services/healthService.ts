import { healthResponseSchema, type HealthResponse } from '@erp/shared';
import { getJson } from './http';

/** Example service: one function per endpoint, validated with the shared schema. Pattern to copy. */
export const healthService = {
  /** GET /health. A 503 still carries a valid body (database down), so it is returned, not thrown. */
  get: (): Promise<HealthResponse> => getJson('/health', healthResponseSchema, { allowStatuses: [503] }),
} as const;

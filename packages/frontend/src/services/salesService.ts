import type { IHttpClient } from './HttpClient';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- TODO(Farhan): add one small method per use case (interface segregation)
export interface ISalesService {}

/**
 * Sales module: frontend API calls, one method per endpoint. Owner: Farhan.
 * TODO(Farhan): invoices, payments, POS sessions, returns (roadmap 5.6).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle). Pattern: the Health slice.
 */
export class SalesService implements ISalesService {
  constructor(protected readonly http: IHttpClient) {}
}

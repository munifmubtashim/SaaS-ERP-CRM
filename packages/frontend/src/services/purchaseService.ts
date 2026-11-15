import type { IHttpClient } from './HttpClient';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- TODO(Farhan): add one small method per use case (interface segregation)
export interface IPurchaseService {}

/**
 * Purchase module: frontend API calls, one method per endpoint. Owner: Farhan.
 * TODO(Farhan): purchase orders, receipts, supplier bills (roadmap 5.7).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle). Pattern: the Health slice.
 */
export class PurchaseService implements IPurchaseService {
  constructor(protected readonly http: IHttpClient) {}
}

import type { IHttpClient } from './HttpClient';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- TODO(Munif): add one small method per use case (interface segregation)
export interface IInventoryService {}

/**
 * Inventory module: frontend API calls, one method per endpoint. Owner: Munif.
 * TODO(Munif): stock movements, balances, transfers, counts (roadmap 4.3, 5.5).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle). Pattern: the Health slice.
 */
export class InventoryService implements IInventoryService {
  constructor(protected readonly http: IHttpClient) {}
}

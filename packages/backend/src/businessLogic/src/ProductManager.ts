import type { IProductQuery } from './contracts/IProductQuery.js';

/**
 * Product module: business rules. No Express, no SQL. Owner: Munif.
 * TODO(Munif): products and catalogue (roadmap 5.4).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle). Pattern: the Health slice.
 */
export class ProductManager {
  constructor(protected readonly query: IProductQuery) {}
}

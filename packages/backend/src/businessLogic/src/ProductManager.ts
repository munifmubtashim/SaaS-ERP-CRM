import type { ProductQuery } from '@erp/dal';

/**
 * Product module, business rules. No Express, no SQL: call ProductQuery. Owner: Munif.
 * TODO(Munif): products and catalogue (roadmap 5.4).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export class ProductManager {
  constructor(readonly query: ProductQuery) {}
}

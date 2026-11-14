import type { ProductManager } from '@erp/business-logic';

/**
 * Product module, HTTP controller. Parse input, call ProductManager, send the response. Owner: Munif.
 * TODO(Munif): products and catalogue (roadmap 5.4).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export class ProductController {
  constructor(readonly manager: ProductManager) {}
}

import { BaseController } from './BaseController.js';
import type { IProductManager } from './contracts/IProductManager.js';

/**
 * Product module: HTTP controller. HTTP in and out only. Owner: Munif.
 * TODO(Munif): products and catalogue (roadmap 5.4).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle). Pattern: the Health slice.
 */
export class ProductController extends BaseController {
  constructor(protected readonly manager: IProductManager) {
    super();
  }
}

import { Router } from 'express';
import type { ProductController } from '../controllers/ProductController.js';
import type { ModuleRoutes } from './types.js';

/**
 * Product module, routes. Owner: Munif.
 * TODO(Munif): products and catalogue (roadmap 5.4).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export function productRoutes(_controller: ProductController): ModuleRoutes {
  const router = Router();
  // TODO(Munif): router.get('/', _controller.list) ... then add an isolation case in test/isolation/cases.ts.
  return { module: 'Product', basePath: '/v1/products', scope: 'tenant', router };
}

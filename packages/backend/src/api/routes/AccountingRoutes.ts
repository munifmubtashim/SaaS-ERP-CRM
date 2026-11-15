import { Router } from 'express';
import type { AccountingController } from '../controllers/AccountingController.js';
import type { ModuleRoutes } from './types.js';

/**
 * Accounting module, routes. Owner: Munif.
 * TODO(Munif): accounts, journals, periods, banking (roadmap 4.3, 5.8).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export function accountingRoutes(_controller: AccountingController): ModuleRoutes {
  const router = Router();
  // TODO(Munif): router.get('/', _controller.list) ... then add an isolation case in test/isolation/cases.ts.
  return { module: 'Accounting', basePath: '/v1/accounting', scope: 'tenant', router };
}

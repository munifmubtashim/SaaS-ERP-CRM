import { Router } from 'express';
import type { PartyController } from '../controllers/PartyController.js';
import type { ModuleRoutes } from './types.js';

/**
 * Party module, routes. Owner: Farhan.
 * TODO(Farhan): customers, suppliers, contacts, dues (roadmap 5.3).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export function partyRoutes(_controller: PartyController): ModuleRoutes {
  const router = Router();
  // TODO(Farhan): router.get('/', _controller.list) ... then add an isolation case in test/isolation/cases.ts.
  return { module: 'Party', basePath: '/v1/parties', scope: 'tenant', router };
}

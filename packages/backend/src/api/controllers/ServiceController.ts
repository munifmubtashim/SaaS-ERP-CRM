import type { ServiceManager } from '@erp/business-logic';

/**
 * Service module, HTTP controller. Parse input, call ServiceManager, send the response. Owner: Farhan.
 * TODO(Farhan): workshop job cards, warranty (roadmap 5.10).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export class ServiceController {
  constructor(readonly manager: ServiceManager) {}
}

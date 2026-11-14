import type { CrmManager } from '@erp/business-logic';

/**
 * Crm module, HTTP controller. Parse input, call CrmManager, send the response. Owner: Farhan.
 * TODO(Farhan): leads, pipeline, campaigns, messaging (roadmap 5.11).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export class CrmController {
  constructor(readonly manager: CrmManager) {}
}

import type { PartyManager } from '@erp/business-logic';

/**
 * Party module, HTTP controller. Parse input, call PartyManager, send the response. Owner: Farhan.
 * TODO(Farhan): customers, suppliers, contacts, dues (roadmap 5.3).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export class PartyController {
  constructor(readonly manager: PartyManager) {}
}

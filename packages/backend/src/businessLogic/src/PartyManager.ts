import type { PartyQuery } from '@erp/dal';

/**
 * Party module, business rules. No Express, no SQL: call PartyQuery. Owner: Farhan.
 * TODO(Farhan): customers, suppliers, contacts, dues (roadmap 5.3).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export class PartyManager {
  constructor(readonly query: PartyQuery) {}
}

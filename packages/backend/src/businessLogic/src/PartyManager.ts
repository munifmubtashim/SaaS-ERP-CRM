import type { IPartyQuery } from './contracts/IPartyQuery.js';

/**
 * Party module: business rules. No Express, no SQL. Owner: Farhan.
 * TODO(Farhan): customers, suppliers, contacts, dues (roadmap 5.3).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle). Pattern: the Health slice.
 */
export class PartyManager {
  constructor(protected readonly query: IPartyQuery) {}
}

import { BaseController } from './BaseController.js';
import type { IPartyManager } from './contracts/IPartyManager.js';

/**
 * Party module: HTTP controller. HTTP in and out only. Owner: Farhan.
 * TODO(Farhan): customers, suppliers, contacts, dues (roadmap 5.3).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle). Pattern: the Health slice.
 */
export class PartyController extends BaseController {
  constructor(protected readonly manager: IPartyManager) {
    super();
  }
}

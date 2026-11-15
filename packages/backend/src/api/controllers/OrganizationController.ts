import { BaseController } from './BaseController.js';
import type { IOrganizationManager } from './contracts/IOrganizationManager.js';

/**
 * Organization module: HTTP controller. HTTP in and out only. Owner: Munif.
 * TODO(Munif): organizations, businesses, branches, roles, scopes, audit log (roadmap 4.2, 5.1, 5.2).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle). Pattern: the Health slice.
 */
export class OrganizationController extends BaseController {
  constructor(protected readonly manager: IOrganizationManager) {
    super();
  }
}

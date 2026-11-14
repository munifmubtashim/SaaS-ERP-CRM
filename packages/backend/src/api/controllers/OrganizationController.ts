import type { OrganizationManager } from '@erp/business-logic';

/**
 * Organization module, HTTP controller. Parse input, call OrganizationManager, send the response. Owner: Munif.
 * TODO(Munif): organizations, businesses, branches, roles, scopes, audit log (roadmap 4.2, 5.1, 5.2).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export class OrganizationController {
  constructor(readonly manager: OrganizationManager) {}
}

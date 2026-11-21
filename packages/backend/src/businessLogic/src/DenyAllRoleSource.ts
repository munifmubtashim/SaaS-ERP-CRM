import type { RoleCode } from '@erp/shared';
import type { IRoleSource } from './contracts/IRoleSource.js';

/**
 * The interim role source until A5 (decided by Farhan on #32): nobody has any role, so every Owner-only action is
 * refused. Explicit, so a missing wiring can never mean "allowed".
 */
export class DenyAllRoleSource implements IRoleSource {
  async roleCodesFor(): Promise<RoleCode[]> {
    return [];
  }
}

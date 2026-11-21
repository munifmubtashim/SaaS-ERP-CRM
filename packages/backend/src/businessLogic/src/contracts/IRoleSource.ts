import type { RoleCode } from '@erp/shared';

/**
 * The caller's roles in an organization (ADR 0010 part 2). The real source is AuthQuery's scope read (A5); until
 * then createManagers is given an explicit one, never a default that allows.
 */
export interface IRoleSource {
  roleCodesFor(userId: string, organizationId: string): Promise<RoleCode[]>;
}

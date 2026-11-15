import type { IHttpClient } from './HttpClient';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- TODO(Munif): add one small method per use case (interface segregation)
export interface IOrganizationService {}

/**
 * Organization module: frontend API calls, one method per endpoint. Owner: Munif.
 * TODO(Munif): organizations, businesses, branches, roles, scopes, audit log (roadmap 4.2, 5.1, 5.2).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle). Pattern: the Health slice.
 */
export class OrganizationService implements IOrganizationService {
  constructor(protected readonly http: IHttpClient) {}
}

import type { IHttpClient } from './HttpClient';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- TODO(Munif): add one small method per use case (interface segregation)
export interface IAuthService {}

/**
 * Auth module: frontend API calls, one method per endpoint. Owner: Munif.
 * TODO(Munif): login, sessions, refresh tokens, 2FA (roadmap 5.1).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle). Pattern: the Health slice.
 */
export class AuthService implements IAuthService {
  constructor(protected readonly http: IHttpClient) {}
}

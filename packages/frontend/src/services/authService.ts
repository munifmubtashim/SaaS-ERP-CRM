import type { LoginRequest, Session } from '@erp/shared';
import type { IHttpClient } from './HttpClient';

/** What the login screen and the shell need from Auth. Interface segregation: one small method per use. */
export interface IAuthService {
  /** Resolves with the session; rejects with ApiRequestError 401 when the login or password is wrong. */
  login(request: LoginRequest): Promise<Session>;
  logout(): Promise<void>;
}

/**
 * Auth module: frontend API calls. Owner: Munif.
 * TODO(Munif, M3): implement IAuthService over HTTP (POST /v1/auth/login, /logout) and switch createServices
 * from MockAuthService to this class. Until then it stays a stub.
 */
export class AuthService {
  constructor(protected readonly http: IHttpClient) {}
}

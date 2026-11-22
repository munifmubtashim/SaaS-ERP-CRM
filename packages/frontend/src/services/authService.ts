import { sessionSchema, type LoginRequest, type Session } from '@erp/shared';
import type { IHttpClient } from './HttpClient';

/** What the login screen and the shell need from Auth. Interface segregation: one small method per use. */
export interface IAuthService {
  /** Resolves with the session; rejects with ApiRequestError 401 when the login or password is wrong. */
  login(request: LoginRequest): Promise<Session>;
  logout(): Promise<void>;
}

/**
 * Auth module: frontend API calls (ADR 0018 part 3). Owner: Munif. The API sets and clears the HttpOnly session
 * cookie; this class never sees the token. The answer is parsed with sessionSchema, so only the user's id and name
 * and the expiry reach the app.
 */
export class AuthService implements IAuthService {
  constructor(protected readonly http: IHttpClient) {}

  login(request: LoginRequest): Promise<Session> {
    return this.http.postJson('/v1/auth/login', request, sessionSchema);
  }

  logout(): Promise<void> {
    return this.http.post('/v1/auth/logout');
  }
}

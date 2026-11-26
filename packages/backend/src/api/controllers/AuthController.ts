import { AppError, loginRequestSchema, type MyBusinessesResponse, type Session } from '@erp/shared';
import type { Request } from 'express';
import {
  clearedSessionCookie,
  readSessionToken,
  sessionCookie,
  type SessionCookieConfig,
} from '../config/sessionCookie.js';
import { BaseController, type HttpResult } from './BaseController.js';
import type { IAuthManager } from './contracts/IAuthManager.js';

/**
 * Auth module: HTTP controller. HTTP in and out only. Owner: Munif.
 * Login (ADR 0018 section 4): the session body, and the session cookie through the result's headers, so the
 * route wrapper sends both together and nothing writes to the response directly.
 */
export class AuthController extends BaseController {
  constructor(
    protected readonly manager: IAuthManager,
    private readonly cookie: SessionCookieConfig,
  ) {
    super();
  }

  async login(req: Request): Promise<HttpResult<Session>> {
    const { login, password } = this.parse(loginRequestSchema, req.body);
    const outcome = await this.manager.login(login, password, req.get('user-agent') ?? null);
    return {
      status: 200,
      body: {
        user: { id: outcome.userId, name: outcome.displayName },
        expiresAt: outcome.expiresAt.toISOString(),
      },
      headers: { 'Set-Cookie': sessionCookie(this.cookie, outcome.token, outcome.absoluteExpiresAt) },
    };
  }

  /** Logout (ADR 0018 section 3): revokes the session, if the cookie names one, and always clears the cookie. */
  async logout(req: Request): Promise<HttpResult<undefined>> {
    const token = readSessionToken(this.cookie, req.headers.cookie);
    if (token) await this.manager.logout(token);
    return { status: 204, body: undefined, headers: { 'Set-Cookie': clearedSessionCookie(this.cookie) } };
  }

  /** GET /v1/me/businesses (ADR 0060): signed in, no business scope; X-Business-Id is not read. */
  async myBusinesses(req: Request): Promise<HttpResult<MyBusinessesResponse>> {
    const session = req.auth;
    if (!session) throw new AppError('UNAUTHENTICATED', 'Sign in to continue.');
    return { status: 200, body: await this.manager.myBusinesses(session) };
  }
}

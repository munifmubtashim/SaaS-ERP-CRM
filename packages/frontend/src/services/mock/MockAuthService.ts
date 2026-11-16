import type { LoginRequest, Session } from '@erp/shared';
import { ApiRequestError } from '../HttpClient';
import type { IAuthService } from '../authService';

/** The one demo user. Obviously fake; it exists only in this mock (removed when the M3 API lands). */
export const DEMO_LOGIN = {
  phone: '+8800000000000',
  email: 'demo@example.com',
  password: 'demo-pass-1234',
} as const;

const DEMO_USER = { id: '0196f000-0000-7000-8000-000000000001', name: 'Demo Owner' };

/** Stands in for the login API until M3. Same contract and error shape as the real service will have. */
export class MockAuthService implements IAuthService {
  constructor(private readonly delayMs = 400) {}

  async login({ login, password }: LoginRequest): Promise<Session> {
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    const known = login === DEMO_LOGIN.phone || login === DEMO_LOGIN.email;
    if (!known || password !== DEMO_LOGIN.password) {
      throw new ApiRequestError(401, {
        code: 'UNAUTHENTICATED',
        message: 'Wrong login or password.',
        fields: [],
        requestId: 'mock',
      });
    }
    return { user: DEMO_USER, expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString() };
  }

  async logout(): Promise<void> {}
}

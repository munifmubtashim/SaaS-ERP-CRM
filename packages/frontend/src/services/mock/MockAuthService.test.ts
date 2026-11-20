import { sessionSchema } from '@erp/shared';
import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '../HttpClient';
import { DEMO_LOGIN, MockAuthService } from './MockAuthService';

const auth = new MockAuthService(0);

describe('MockAuthService (stands in for the M3 login API)', () => {
  it('signs in the demo user by phone or by email and returns a valid session', async () => {
    for (const login of [DEMO_LOGIN.phone, DEMO_LOGIN.email]) {
      const session = await auth.login({ login, password: DEMO_LOGIN.password });
      expect(sessionSchema.safeParse(session).success).toBe(true);
    }
  });

  it('rejects a wrong password with the API error shape (401 UNAUTHENTICATED)', async () => {
    const attempt = auth.login({ login: DEMO_LOGIN.phone, password: 'wrong-password' });
    await expect(attempt).rejects.toBeInstanceOf(ApiRequestError);
    await expect(attempt).rejects.toMatchObject({ status: 401, body: { code: 'UNAUTHENTICATED' } });
  });

  it('rejects an unknown user the same way, so the screen cannot tell which part was wrong', async () => {
    await expect(
      auth.login({ login: 'nobody@example.com', password: DEMO_LOGIN.password }),
    ).rejects.toMatchObject({
      status: 401,
    });
  });
});

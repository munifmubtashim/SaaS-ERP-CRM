import type { Session } from '@erp/shared';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './authService';
import { ApiRequestError, type IHttpClient } from './HttpClient';

/** AuthService over HTTP (ADR 0018 part 3): the real routes, behind the same IAuthService the login screen uses. */
const session: Session = {
  user: { id: '0196f000-0000-7000-8000-000000000001', name: 'Demo Owner' },
  expiresAt: '2099-01-01T00:00:00.000Z',
};

function fakeHttp(answer: Session | Error = session) {
  const http = {
    getJson: vi.fn(),
    postJson: vi.fn(async () => {
      if (answer instanceof Error) throw answer;
      return answer;
    }),
    post: vi.fn(async () => undefined),
  };
  return { http: http as unknown as IHttpClient, calls: http };
}

describe('AuthService (ADR 0018 part 3)', () => {
  it('login POSTs the request to /v1/auth/login and returns the session body', async () => {
    const { http, calls } = fakeHttp();
    const request = { login: 'owner@example.com', password: 'long-enough-1' };
    await expect(new AuthService(http).login(request)).resolves.toEqual(session);
    expect(calls.postJson).toHaveBeenCalledWith('/v1/auth/login', request, expect.anything());
  });

  it('a refused login is the ApiRequestError 401 the API sent, unchanged', async () => {
    const refused = new ApiRequestError(401, {
      code: 'UNAUTHENTICATED',
      message: 'Login or password is wrong.',
      fields: [],
      requestId: 'r1',
    });
    const { http } = fakeHttp(refused);
    await expect(
      new AuthService(http).login({ login: 'x@example.com', password: 'long-enough-1' }),
    ).rejects.toBe(refused);
  });

  it('logout POSTs /v1/auth/logout (the API revokes the session and clears the cookie)', async () => {
    const { http, calls } = fakeHttp();
    await new AuthService(http).logout();
    expect(calls.post).toHaveBeenCalledWith('/v1/auth/logout');
  });
});

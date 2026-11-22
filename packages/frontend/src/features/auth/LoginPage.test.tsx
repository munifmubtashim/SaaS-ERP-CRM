import type { LoginRequest, Session } from '@erp/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { ServicesContext } from '../../app/servicesContext';
import { I18nProvider } from '../../i18n';
import { ApiRequestError, type IAuthService } from '../../services';
import { sessionStore } from '../../store/sessionStore';
import { FakeHealthService, fakeServices } from '../../test/fakeServices';
import { LoginPage } from './LoginPage';
import { RequireSession } from './RequireSession';

const session: Session = {
  user: { id: '0196f000-0000-7000-8000-000000000001', name: 'Demo Owner' },
  expiresAt: '2099-01-01T00:00:00.000Z',
};

/** Fake IAuthService whose answer the test controls, including "still waiting". */
class FakeAuthService implements IAuthService {
  calls: LoginRequest[] = [];
  release: (() => void) | null = null;
  constructor(
    private readonly answer: Session | Error,
    private readonly hold = false,
  ) {}
  login(request: LoginRequest): Promise<Session> {
    this.calls.push(request);
    return new Promise((resolve, reject) => {
      const settle = () => (this.answer instanceof Error ? reject(this.answer) : resolve(this.answer));
      if (this.hold) this.release = settle;
      else settle();
    });
  }
  async logout(): Promise<void> {}
}

function renderApp(auth: IAuthService, { start = '/login', locale = 'en' as 'en' | 'bn' } = {}) {
  const router = createMemoryRouter(
    [
      { path: '/login', element: <LoginPage /> },
      {
        path: '/',
        element: (
          <RequireSession>
            <p>Home screen</p>
          </RequireSession>
        ),
      },
    ],
    { initialEntries: [start] },
  );
  const services = fakeServices(new FakeHealthService(new Error('unused')), { auth });
  render(
    <ServicesContext.Provider value={services}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
        <I18nProvider locale={locale}>
          <RouterProvider router={router} />
        </I18nProvider>
      </QueryClientProvider>
    </ServicesContext.Provider>,
  );
  return router;
}

function fillAndSubmit(login: string, password: string) {
  fireEvent.change(screen.getByLabelText('Phone or email'), { target: { value: login } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

afterEach(() => sessionStore.clear());

describe('LoginPage', () => {
  it('signs in, stores the session and opens the home screen', async () => {
    const auth = new FakeAuthService(session);
    renderApp(auth);
    fillAndSubmit('01000000000', 'long-enough-1');
    expect(await screen.findByText('Home screen')).toBeInTheDocument();
    expect(auth.calls).toEqual([{ login: '+8801000000000', password: 'long-enough-1' }]);
    expect(sessionStore.get()).toEqual(session);
  });

  it('shows field errors and sends nothing when the input is invalid', async () => {
    const auth = new FakeAuthService(session);
    renderApp(auth);
    fillAndSubmit('not-a-login', 'short');
    expect(
      await screen.findByText('Enter a phone number like 01XXXXXXXXX or an email address.'),
    ).toBeInTheDocument();
    expect(screen.getByText('The password has at least 8 characters.')).toBeInTheDocument();
    expect(auth.calls).toEqual([]);
  });

  it('shows a loading state while signing in', async () => {
    const auth = new FakeAuthService(session, true);
    renderApp(auth);
    fillAndSubmit('demo@example.com', 'long-enough-1');
    const button = await screen.findByRole('button', { name: 'Signing in…' });
    expect(button).toBeDisabled();
    auth.release?.();
    expect(await screen.findByText('Home screen')).toBeInTheDocument();
  });

  it('says the phone, email or password is wrong without saying which', async () => {
    const wrong = new ApiRequestError(401, {
      code: 'UNAUTHENTICATED',
      message: 'Wrong login or password.',
      fields: [],
      requestId: 'test',
    });
    renderApp(new FakeAuthService(wrong));
    fillAndSubmit('demo@example.com', 'long-enough-1');
    expect(await screen.findByRole('alert')).toHaveTextContent('The phone, email or password is not right.');
    expect(sessionStore.get()).toBeNull();
  });

  it('says the service cannot be reached when the failure is not a wrong password', async () => {
    renderApp(new FakeAuthService(new TypeError('Failed to fetch')));
    fillAndSubmit('demo@example.com', 'long-enough-1');
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not sign in. Try again in a moment.');
  });

  it('shows the same message for a wrong password and an unknown login, never the API message', async () => {
    const shown: string[] = [];
    for (const message of ['Login or password is wrong.', 'Some other server wording']) {
      const refused = new ApiRequestError(401, {
        code: 'UNAUTHENTICATED',
        message,
        fields: [],
        requestId: 'r',
      });
      renderApp(new FakeAuthService(refused));
      fillAndSubmit('demo@example.com', 'long-enough-1');
      const alert = await screen.findByRole('alert');
      expect(alert).not.toHaveTextContent(message);
      shown.push(alert.textContent ?? '');
      cleanup();
    }
    expect(shown[0]).toBe(shown[1]);
  });

  it('after too many attempts (429) asks to wait, without saying whether the account exists', async () => {
    const limited = new ApiRequestError(429, {
      code: 'RATE_LIMITED',
      message: 'Too many login attempts. Try again later.',
      fields: [],
      requestId: 'r',
    });
    renderApp(new FakeAuthService(limited));
    fillAndSubmit('demo@example.com', 'long-enough-1');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts. Wait 15 minutes, then try again.',
    );
  });

  it('renders in Bangla', () => {
    renderApp(new FakeAuthService(session), { locale: 'bn' });
    expect(screen.getByRole('button', { name: 'সাইন ইন' })).toBeInTheDocument();
  });
});

describe('RequireSession', () => {
  it('sends a signed-out user to the login screen', async () => {
    const router = renderApp(new FakeAuthService(session), { start: '/' });
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });

  it('lets a signed-in user through', () => {
    sessionStore.set(session);
    renderApp(new FakeAuthService(session), { start: '/' });
    expect(screen.getByText('Home screen')).toBeInTheDocument();
  });

  it('treats an expired session as signed out', async () => {
    sessionStore.set({ ...session, expiresAt: '2000-01-01T00:00:00.000Z' });
    const router = renderApp(new FakeAuthService(session), { start: '/' });
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });
});

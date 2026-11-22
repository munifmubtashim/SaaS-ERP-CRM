# Org, auth and dashboard UI, part B: login screen

## What was built

A sign-in screen and the rule that the rest of the app needs a signed-in user. It runs against a mock auth
service until the real login API (M3) exists; swapping it is one line in `createServices`.

- **Login screen** (`/login`): phone or email, password, and a language switch. It answers "who are you?" and
  its one action is Sign in. States: field errors, signing in (button disabled), wrong login or password (one
  message that does not say which part was wrong), and service unreachable.
- **Session store:** the session is kept for the browser tab, so a reload keeps you signed in and closing the
  tab signs you out. An expired session counts as signed out.
- **Guard:** every page inside the app shell needs a session; without one you go to `/login`, then back.
- **Header:** "Signed in as …" and Sign out.
- The chosen theme and language now apply on every page, the login screen included.

## Request flow

1. A signed-out user opens `/`; `RequireSession` sends them to `/login` and remembers where they were going.
2. They type a phone (`01…` is turned into `+880…`) or an email, and a password.
3. The form checks the input with the shared `loginRequestSchema`; problems show next to the fields.
4. `useLogin` calls `auth.login()` through the `IAuthService` interface (today `MockAuthService`).
5. The mock waits briefly, then returns a session or a 401 error in the API's error shape.
6. On success the session goes into the session store and the user returns to the page they wanted.
7. Sign out calls `auth.logout()` and clears the store; the guard then shows the login screen.

## Why each file exists

- `features/auth/LoginPage.tsx`: the screen; renders only.
- `features/auth/useLogin.ts`: the sign-in and sign-out logic (TanStack Query mutations).
- `features/auth/RequireSession.tsx`: the guard around the app shell.
- `features/auth/normalizeLogin.ts`: what people type becomes what the API expects.
- `store/sessionStore.ts`: the signed-in session for this tab.
- `services/authService.ts`: `IAuthService`; the HTTP class arrives with M3.
- `services/mock/MockAuthService.ts`: the stand-in, with the same contract and error shape.
- `app/router.tsx`, `app/AppShell/*`, `app/providers.tsx`: the login route, the header, the language switch, and
  theme and language for every page.
- `i18n/en.ts`, `i18n/bn.ts`: every string in English and Bangla.

## Five questions an interviewer could ask

1. Why does the wrong-password message not say whether the phone or the password was wrong?
2. Why keep the session in sessionStorage rather than localStorage, and what changes when the real API uses cookies?
3. How does the mock make it cheap to switch to the real API later?
4. Why is the input checked with the shared schema on the client if the server checks it too?
5. What does the guard do with an expired session, and why check expiry on the client at all?

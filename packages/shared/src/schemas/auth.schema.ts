import { z } from 'zod';

/**
 * Auth module, Zod schemas shared by backend and frontend. Owner: Munif.
 * Login and session shapes (task M3). Roles join the session once ADR 0001 row 8 (role names) is accepted.
 */

/** A login is an E.164 phone (`+880…`) or an email. The form normalises what the user types. */
export const loginIdSchema = z.union([z.e164(), z.email()], {
  error: 'Enter a phone number in +880 form or an email address.',
});

export const loginRequestSchema = z.object({
  login: z.string().trim().pipe(loginIdSchema),
  password: z.string().min(8).max(128),
});

export const sessionUserSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(200),
});

/** What the API returns after a login. Unknown keys are stripped, so nothing secret can ride along. */
export const sessionSchema = z.object({
  user: sessionUserSchema,
  /** ISO 8601, UTC. */
  expiresAt: z.iso.datetime(),
});

import type { z } from 'zod';
import type { loginRequestSchema, sessionSchema, sessionUserSchema } from '../schemas/auth.schema.js';

/** Auth module, types inferred from the Zod schemas. Owner: Munif. */
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type SessionUser = z.infer<typeof sessionUserSchema>;
export type Session = z.infer<typeof sessionSchema>;

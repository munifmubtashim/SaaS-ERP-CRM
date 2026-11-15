import type { z } from 'zod';
import type { authSchema } from '../schemas/auth.schema.js';

/**
 * Auth module, types. Owner: Munif.
 * TODO(Munif): login, sessions, refresh tokens, 2FA (roadmap 5.1).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export type Auth = z.infer<typeof authSchema>;

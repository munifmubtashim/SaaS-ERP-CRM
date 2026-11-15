import type { z } from 'zod';
import type { partySchema } from '../schemas/party.schema.js';

/**
 * Party module, types. Owner: Farhan.
 * TODO(Farhan): customers, suppliers, contacts, dues (roadmap 5.3).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export type Party = z.infer<typeof partySchema>;

import type { z } from 'zod';
import type { inventorySchema } from '../schemas/inventory.schema.js';

/**
 * Inventory module, types. Owner: Munif.
 * TODO(Munif): stock movements, balances, transfers, counts (roadmap 4.3, 5.5).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export type Inventory = z.infer<typeof inventorySchema>;

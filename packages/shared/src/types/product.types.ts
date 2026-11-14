import type { z } from 'zod';
import type { productSchema } from '../schemas/product.schema.js';

/**
 * Product module, types. Owner: Munif.
 * TODO(Munif): products and catalogue (roadmap 5.4).
 * Stub only: no logic until a plan is agreed (CLAUDE.md lifecycle).
 */
export type Product = z.infer<typeof productSchema>;

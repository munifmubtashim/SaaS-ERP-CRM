import type { z } from 'zod';
import type {
  activeScopeSchema,
  branchSummarySchema,
  businessSummarySchema,
  createBranchSchema,
  createBusinessSchema,
  myBusinessesResponseSchema,
  provisionedBranchSchema,
  provisionedBusinessSchema,
} from '../schemas/organization.schema.js';

/** Organization module, types inferred from the Zod schemas. Owner: Munif. */
export type BranchSummary = z.infer<typeof branchSummarySchema>;
export type BusinessSummary = z.infer<typeof businessSummarySchema>;
export type MyBusinessesResponse = z.infer<typeof myBusinessesResponseSchema>;
export type ActiveScope = z.infer<typeof activeScopeSchema>;
export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;
export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type ProvisionedBusinessView = z.infer<typeof provisionedBusinessSchema>;
export type ProvisionedBranchView = z.infer<typeof provisionedBranchSchema>;

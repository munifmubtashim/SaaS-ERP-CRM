import { z } from 'zod';

/**
 * Organization module, Zod schemas shared by backend and frontend. Owner: Munif.
 * The businesses and branches a user may work in, and the active one (spec O-04, task M2).
 */
export const branchSummarySchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(200),
});

export const businessSummarySchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(200),
  /** A business always has at least one branch (spec O-01). */
  branches: z.array(branchSummarySchema).min(1),
});

/** GET /v1/me/businesses: the businesses and branches this user may use. */
export const myBusinessesResponseSchema = z.object({
  items: z.array(businessSummarySchema),
});

/** The business and branch the user is working in; every write uses exactly this business (ADR 0005, Q2). */
export const activeScopeSchema = z.object({
  businessId: z.uuid(),
  branchId: z.uuid(),
});

/**
 * A branch's short code (ADR 0009): 2 to 6 characters, a letter first, then uppercase letters or digits. The same
 * rule as the database CHECK. Lower case is refused, never changed: the branch form upper-cases as you type.
 */
export const branchShortCodeSchema = z.string().regex(/^[A-Z][A-Z0-9]{1,5}$/);

/**
 * POST /v1/businesses (ADR 0010). There is no organizationId: the organization always comes from the caller's
 * session, and z.object drops any unknown key, so a body that names another organization can't reach a Query.
 */
export const createBusinessSchema = z.object({
  legalEntityId: z.uuid(),
  name: z.string().trim().min(1).max(200),
  bin: z.string().trim().min(1).max(50).optional(),
  address: z.string().trim().min(1).max(500).optional(),
});

/** POST /v1/businesses/:id/branches (ADR 0010). */
export const createBranchSchema = z.object({
  name: z.string().trim().min(1).max(200),
  shortCode: branchShortCodeSchema,
  address: z.string().trim().min(1).max(500).optional(),
});

/** A business as the provisioning path returns it. */
export const provisionedBusinessSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  legalEntityId: z.uuid(),
  name: z.string(),
  isActive: z.boolean(),
  version: z.number().int(),
});

/** A branch as the provisioning path returns it. */
export const provisionedBranchSchema = z.object({
  id: z.uuid(),
  businessId: z.uuid(),
  name: z.string(),
  shortCode: branchShortCodeSchema,
  isActive: z.boolean(),
  version: z.number().int(),
});

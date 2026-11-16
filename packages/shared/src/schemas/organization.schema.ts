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

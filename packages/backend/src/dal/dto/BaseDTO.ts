/**
 * Columns every business-owned row carries (roadmap 5). A <Module>DTO is the shape a Query returns:
 * database rows, before businessLogic turns them into the shared types the API sends.
 * Money columns are numeric(18,2) and arrive as strings or Prisma.Decimal, never JavaScript numbers.
 */
export interface BaseDTO {
  /** UUID v7 */
  id: string;
  businessId: string;
  /** Present on branch-scoped tables only. */
  branchId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  /** Optimistic-locking version, where rows are edited concurrently. */
  version?: number;
}

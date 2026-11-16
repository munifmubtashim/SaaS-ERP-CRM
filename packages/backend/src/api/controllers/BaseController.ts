import type { z } from 'zod';
import { parseInput } from '../middleware/validate.js';

/** What a Controller method returns. The route wrapper sends it, after the commit for tenant routes (ADR 0005). */
export interface HttpResult<T = unknown> {
  status: number;
  body: T;
}

/**
 * Response and validation helpers every Controller uses. Controllers do HTTP in and out only:
 * parse input, call a Manager through its interface, return {status, body}. They never write the response:
 * the route wrapper sends it, so a tenant response leaves only after its transaction commits. Errors are
 * thrown (AppError) and answered by errorMiddleware, never formatted here.
 */
export abstract class BaseController {
  /** Validate untrusted input with a shared Zod schema; throws VALIDATION_FAILED. */
  protected parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
    return parseInput(schema, input);
  }

  protected json<T>(status: number, body: T): HttpResult<T> {
    return { status, body };
  }
}

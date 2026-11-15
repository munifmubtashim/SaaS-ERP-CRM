import type { Response } from 'express';
import type { z } from 'zod';
import { parseInput } from '../middleware/validate.js';

/**
 * Response and validation helpers every Controller uses. Controllers do HTTP in and out only:
 * parse input, call a Manager through its interface, send the result. Errors are thrown
 * (AppError) and answered by errorMiddleware, never formatted here.
 */
export abstract class BaseController {
  /** Validate untrusted input with a shared Zod schema; throws VALIDATION_FAILED. */
  protected parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
    return parseInput(schema, input);
  }

  protected sendJson(res: Response, status: number, body: unknown): void {
    res.status(status).json(body);
  }
}

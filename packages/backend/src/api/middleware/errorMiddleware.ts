import { AppError, ERROR_STATUS, type ApiError, type ErrorCode, type FieldError } from '@erp/shared';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { z } from 'zod';
import { zodIssuesToFields } from './validate.js';

function body(code: ErrorCode, message: string, requestId: unknown, fields: FieldError[] = []): ApiError {
  return { code, message, fields, requestId: String(requestId) };
}

/** Any request that matched no route. */
export const notFoundMiddleware: RequestHandler = (req, res) => {
  res.status(404).json(body('NOT_FOUND', `No route for ${req.method} ${req.path}.`, req.id));
};

/** The only place an error becomes an HTTP response: {code, message, fields[], requestId}. Mounted last. */
export const errorMiddleware: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  if (err instanceof AppError) {
    res.status(ERROR_STATUS[err.code]).json(body(err.code, err.message, req.id, err.fields));
    return;
  }
  if (err instanceof z.ZodError) {
    res
      .status(400)
      .json(body('VALIDATION_FAILED', 'The request has invalid fields.', req.id, zodIssuesToFields(err)));
    return;
  }
  // body-parser errors (malformed JSON, body too large) carry a `type` and a 4xx status.
  if (typeof err === 'object' && err !== null && 'type' in err && 'status' in err && err.status === 400) {
    res.status(400).json(body('VALIDATION_FAILED', 'The request body is not valid JSON.', req.id));
    return;
  }
  req.log.error({ err }, 'unhandled error');
  res.status(500).json(body('INTERNAL_ERROR', 'Something went wrong. Quote the request id.', req.id));
};

import type { RequestHandler } from 'express';
import type { ZodSchema } from 'zod';

/**
 * Parses `req.body`/`query`/`params` against the given Zod schemas and reassigns each one to its
 * *parsed* value — reassignment matters, since a schema's `.default()`/`.transform()` only takes
 * effect on the value `.parse()` returns, not on the original.
 *
 * Synchronous: a thrown `ZodError` is caught by Express 4 itself (a non-async handler that
 * throws is forwarded to `next(err)` automatically) and lands in `error-handler.ts`, which
 * already special-cases `ZodError` into a 400 `VALIDATION_FAILED` response. No `asyncHandler`
 * and no extra wiring needed here.
 */
export function validate(schemas: {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}): RequestHandler {
  return (req, _res, next) => {
    if (schemas.body) req.body = schemas.body.parse(req.body);
    if (schemas.query) req.query = schemas.query.parse(req.query);
    if (schemas.params) req.params = schemas.params.parse(req.params);
    next();
  };
}

import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Forwards a rejected promise to Express's error handler.
 *
 * Express 4 does not await route handlers, so an async handler that throws produces an
 * unhandled rejection and a request that hangs until the client times out — no 500, nothing in
 * the error handler, nothing useful in the logs. Every async route goes through this.
 *
 * (Express 5 handles this natively — drop this the moment the app upgrades.)
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '@/shared/errors/AppError.js';
import { logger } from '@/shared/logging/logger.js';
import { buildErrorBody } from './response.util.js';

/** Unwraps an `Error.cause` chain into something a log line can carry. */
function causeChain(err: unknown, depth = 0): string | undefined {
  if (!(err instanceof Error) || err.cause === undefined || depth > 4) return undefined;
  const cause = err.cause;
  const head = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
  const rest = causeChain(cause, depth + 1);
  return rest === undefined ? head : `${head} <- ${rest}`;
}

/**
 * The single place an error becomes a response.
 *
 * Translates the error types the app actually throws into the wire envelope, and decides what
 * gets logged at which level. Anything unrecognised is a genuine fault: logged with its stack,
 * reported to the caller as a generic 500.
 *
 * Register LAST in `app.ts`, after every route.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    // Expected errors are traffic, not incidents. Logging them at `error` trains everyone to
    // ignore the error log, which is how a real fault goes unnoticed.
    logger[err.isExpected ? 'info' : 'error'](
      {
        code: err.code,
        status: err.statusCode,
        url: req.originalUrl,
        details: err.details,
        ...(err.isExpected ? {} : { stack: err.stack, cause: causeChain(err) }),
      },
      'request failed',
    );

    res.status(err.statusCode).json(
      buildErrorBody(req, {
        statusCode: err.statusCode,
        code: err.code,
        message: err.message,
        publicDetails: err.publicDetails,
        details: err.details,
        stack: err.stack,
      }),
    );
    return;
  }

  if (err instanceof ZodError) {
    // `publicDetails`, not `details`: a client cannot highlight the offending field without
    // being told which one it is, and Zod's issues name nothing but the caller's own payload.
    res.status(400).json(
      buildErrorBody(req, {
        statusCode: 400,
        code: 'VALIDATION_FAILED',
        message: 'Some of the details provided are not valid.',
        publicDetails: err.issues,
      }),
    );
    return;
  }

  const stack = err instanceof Error ? err.stack : undefined;
  logger.error(
    { url: req.originalUrl, err: String(err), stack, cause: causeChain(err) },
    'unhandled error',
  );

  res.status(500).json(
    buildErrorBody(req, {
      statusCode: 500,
      code: 'INTERNAL',
      message: 'Something went wrong. Please try again shortly.',
      stack,
    }),
  );
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json(
    buildErrorBody(req, {
      statusCode: 404,
      code: 'NOT_FOUND',
      message: `No route matches ${req.method} ${req.originalUrl}`,
    }),
  );
}

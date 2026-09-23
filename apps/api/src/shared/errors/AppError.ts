import type { FaultCode } from '@greynote/contracts';

/**
 * An error with an HTTP status and a customer-safe message.
 *
 * `message` is displayed to whoever made the request, so it must never carry a cause, a query,
 * or an internal identifier.
 *
 * There are TWO detail channels and the distinction is the point:
 *
 *   `publicDetails` — what the CALLER needs in order to act. Field-level validation errors,
 *   almost always. Returned in every environment, because a 400 that doesn't say which field
 *   was wrong forces the client to guess.
 *
 *   `details` — diagnostics for US. Logged always, stripped from production responses, because
 *   returning them hands internals to whoever can trigger the error.
 *
 * Putting validation errors in `details` looks safe and quietly breaks every client in
 * production — keep the two apart.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: FaultCode;
  /** Diagnostic. Logged, and stripped from production responses. */
  readonly details?: unknown;
  /** Caller-facing. Returned in every environment. */
  readonly publicDetails?: unknown;
  /** False for genuine faults — used to decide what pages someone. */
  readonly isExpected: boolean;

  constructor(opts: {
    statusCode: number;
    code: FaultCode;
    message: string;
    details?: unknown;
    publicDetails?: unknown;
    isExpected?: boolean;
    /**
     * The error this one wraps. Without it the stack starts at the rethrow rather than at
     * the failure that caused it.
     */
    cause?: unknown;
  }) {
    super(opts.message, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = 'AppError';
    this.statusCode = opts.statusCode;
    this.code = opts.code;
    this.details = opts.details;
    this.publicDetails = opts.publicDetails;
    this.isExpected = opts.isExpected ?? true;
    Error.captureStackTrace?.(this, AppError);
  }

  /** `publicDetails` because the caller has to know which field to fix. */
  static badRequest(message: string, publicDetails?: unknown): AppError {
    return new AppError({ statusCode: 400, code: 'VALIDATION_FAILED', message, publicDetails });
  }

  static unauthenticated(message = 'Please sign in to continue.'): AppError {
    return new AppError({ statusCode: 401, code: 'UNAUTHENTICATED', message });
  }

  static forbidden(message = 'You do not have access to this.'): AppError {
    return new AppError({ statusCode: 403, code: 'FORBIDDEN', message });
  }

  static notFound(message = 'Not found.'): AppError {
    return new AppError({ statusCode: 404, code: 'NOT_FOUND', message });
  }

  static conflict(message: string, publicDetails?: unknown): AppError {
    return new AppError({ statusCode: 409, code: 'CONFLICT', message, publicDetails });
  }

  /**
   * A fault that should be impossible — a violated invariant rather than bad input.
   *
   * `isExpected: false` is what routes it to an alert. The customer-facing message is
   * deliberately generic. Everything explanatory goes to `details` and `cause`, which are
   * logged and never returned in production.
   */
  static internal(code: FaultCode, details?: unknown, cause?: unknown): AppError {
    return new AppError({
      statusCode: 500,
      code,
      message: 'Something went wrong. Please try again shortly.',
      details,
      isExpected: false,
      cause,
    });
  }
}

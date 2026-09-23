/**
 * The envelope every `/api` route returns.
 *
 * Single source of truth, shared by `apps/api` and, once it exists, `apps/mobile`
 * (docs/hld/03-system-architecture.md). A field renamed here is a type error at every
 * consumer rather than a runtime surprise discovered by a field rep mid-shift.
 */

export interface RequestMeta {
  method: string;
  url: string;
  /**
   * Correlates this response with the server logs that produced it, and is also returned in
   * the `x-request-id` header. Safe to show in a UI — "quote this ID to support" is the whole
   * point, and it carries no information about anything but the request itself.
   */
  requestId: string;
  /** Omitted in production. */
  ip?: string;
}

export interface HttpSuccessBody<T = unknown> {
  success: true;
  statusCode: number;
  request: RequestMeta;
  message: string;
  data: T;
}

export interface HttpErrorBody {
  success: false;
  statusCode: number;
  code: string;
  request: RequestMeta;
  message: string;
  /**
   * Detail the CALLER needs in order to act — field-level validation errors, most often.
   * Returned in every environment, so a client can highlight the offending input.
   *
   * This is deliberately not the same channel as the server's own diagnostics. Anything that
   * would leak a query, a connection string or an internal identifier belongs in the log, and
   * `AppError` keeps the two apart: `publicDetails` lands here, `details` does not.
   */
  data?: unknown;
  /** Stack trace — omitted in production. */
  trace?: string;
}

export type HttpBody<T = unknown> = HttpSuccessBody<T> | HttpErrorBody;

export function isHttpError<T>(body: HttpBody<T>): body is HttpErrorBody {
  return body.success === false;
}

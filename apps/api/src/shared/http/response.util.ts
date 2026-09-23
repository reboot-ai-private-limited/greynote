import type { HttpErrorBody, HttpSuccessBody, RequestMeta } from '@greynote/contracts';
import type { Request, Response } from 'express';
import { isProduction } from '@/config/env.js';
import { getRequestId } from './request-context.js';

/**
 * The two functions that build every response body.
 *
 * The envelope shape lives in @greynote/contracts and is imported, not redeclared — every
 * consumer reads the same definition, so a field renamed here is a type error at the consumer
 * rather than a runtime surprise discovered in the field.
 */

function meta(req: Request): RequestMeta {
  return {
    method: req.method,
    url: req.originalUrl,
    // Falls back only if a response is built outside the request-id middleware — in
    // practice a test constructing a body by hand. Empty rather than generated: an ID that
    // appears in a response and in no log line is worse than none.
    requestId: getRequestId() ?? '',
    // Omit the key rather than set it to undefined — with exactOptionalPropertyTypes those
    // are different things, and `{ ip: undefined }` would serialise a null into the envelope.
    ...(isProduction || req.ip === undefined ? {} : { ip: req.ip }),
  };
}

export function sendSuccess<T>(
  req: Request,
  res: Response,
  data: T,
  message = 'OK',
  statusCode = 200,
): void {
  const body: HttpSuccessBody<T> = { success: true, statusCode, request: meta(req), message, data };
  res.status(statusCode).json(body);
}

export function buildErrorBody(
  req: Request,
  opts: {
    statusCode: number;
    code: string;
    message: string;
    /** Caller-facing. Sent in every environment. */
    publicDetails?: unknown;
    /** Diagnostic. Logged always; sent only outside production. */
    details?: unknown;
    stack?: string | undefined;
  },
): HttpErrorBody {
  // Outside production the diagnostic detail is more useful than the public one and there is
  // no reason to hide either, so it wins the single `data` slot when both are present.
  const data = isProduction ? opts.publicDetails : (opts.details ?? opts.publicDetails);

  return {
    success: false,
    statusCode: opts.statusCode,
    code: opts.code,
    request: meta(req),
    message: opts.message,
    ...(data === undefined ? {} : { data }),
    // The stack is never a caller's business — it names files, line numbers and dependency
    // versions, which is a map of the server for anyone probing it.
    ...(isProduction || opts.stack === undefined ? {} : { trace: opts.stack }),
  };
}

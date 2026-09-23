import type { RequestHandler } from 'express';
import { pinoHttp } from 'pino-http';
import { logger } from '@/shared/logging/logger.js';
import { getRequestId } from './request-context.js';

/**
 * One line per request: what was asked, what came back, how long it took.
 *
 * Registered after `requestIdMiddleware`, so the access line and every application line written
 * during that request share a `requestId` and can be pulled up together.
 *
 * `/api/health` is excluded while it succeeds — a container healthcheck polling every few
 * seconds is thousands of lines a day carrying no information. A failing health check still
 * logs, since that's exactly what you want to see. Add further high-frequency polling paths
 * (e.g. a future sync/ping endpoint) to `SILENT_PATHS`/`SILENT_PREFIXES` as they show up.
 */
const SILENT_PATHS = new Set(['/api/health']);
const SILENT_PREFIXES: string[] = [];

function isSilent(url: string): boolean {
  const path = url.split('?')[0] ?? url;
  return SILENT_PATHS.has(path) || SILENT_PREFIXES.some((p) => path.startsWith(p));
}

export function accessLogMiddleware(): RequestHandler {
  return pinoHttp({
    logger,

    /**
     * The route PATTERN, not the raw URL. `/api/health` groups; a raw URL with a query
     * string does not. `req.route` is only populated once Express has matched a handler, so
     * unmatched requests fall back to the path with its query string dropped.
     */
    customProps: (req) => {
      const route = (req as { route?: { path?: string } }).route?.path;
      const baseUrl = (req as { baseUrl?: string }).baseUrl ?? '';
      return {
        route: route === undefined ? (req.url?.split('?')[0] ?? '') : `${baseUrl}${route}`,
        requestId: getRequestId(),
      };
    },

    autoLogging: {
      ignore: (req) => isSilent(req.url ?? ''),
    },

    /**
     * Expected traffic logs at `info`; only genuine faults reach `error`. A 404 is a client
     * asking for something that isn't there, not an incident — logging it at `error` trains
     * everyone to ignore the error log, which is how a real fault goes unnoticed.
     */
    customLogLevel: (_req, res, err) => {
      if (err !== undefined && err !== null) return 'error';
      if (res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },

    customSuccessMessage: () => 'request',
    customErrorMessage: () => 'request failed',

    /**
     * The default serialisers attach the whole req and res, headers included — which is how
     * a bearer token ends up in a log despite the redact list, since it arrives under a
     * shape the paths do not name. Only these fields are kept.
     */
    serializers: {
      req: (req: { method?: string; url?: string }) => ({
        method: req.method,
        path: req.url?.split('?')[0],
      }),
      res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
    },
  }) as unknown as RequestHandler;
}

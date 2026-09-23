import pino from 'pino';
import { env, isProduction } from '@/config/env.js';
import { getRequestId } from '@/shared/http/request-context.js';

/**
 * Structured logs to stdout. Nothing writes log files — the container runtime owns collection,
 * and a process writing its own logs is a disk-full outage waiting for a busy day.
 *
 * pino rather than winston, for `redact` below rather than throughput: this system handles
 * passwords, phone numbers and refresh tokens (docs/erd/01-identity-hierarchy.md); winston has
 * no redaction, so under it every one of those rules would be a custom format hand-written and
 * hand-maintained.
 *
 * NOTE THE ARGUMENT ORDER: `logger.info({ data }, 'message')`. It is the reverse of winston's
 * `logger.info('message', { data })`, and getting it backwards is not an error — pino logs the
 * object as the message and silently drops every field.
 */

/**
 * Fields that must never reach a log, whatever wraps them. `*.x` covers one level of nesting,
 * which is where these actually appear — inside a request body or a mapped entity.
 */
const REDACTED_PATHS = [
  'phone',
  '*.phone',
  'password',
  'password_hash',
  '*.password',
  '*.password_hash',
  'token',
  'refresh_token',
  'refresh_token_hash',
  '*.token',
  '*.refresh_token',
  '*.refresh_token_hash',
  'req.headers.authorization',
  'headers.authorization',
];

export const logger = pino({
  level: env.LOG_LEVEL,

  redact: {
    paths: REDACTED_PATHS,
    censor: '[redacted]',
  },

  /**
   * Stamps every line with the current request ID, read from the async context rather than
   * passed in. A mixin rather than a convention, because a convention is only as good as the
   * last person who remembered it — and the lines you most want correlated are written in a
   * hurry inside a catch block.
   */
  mixin() {
    const requestId = getRequestId();
    return requestId === undefined ? {} : { requestId };
  },

  formatters: {
    // `level: "info"` rather than pino's default `level: 30` — readable in every log viewer.
    level: (label) => ({ level: label }),
  },

  timestamp: pino.stdTimeFunctions.isoTime,

  // Human-readable in development, JSON in production — from one config.
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
            messageFormat: '{if requestId}[{requestId}] {end}{msg}',
          },
        },
      }),
});

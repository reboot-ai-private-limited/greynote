import pino from 'pino';
import { env } from '@/config/env';
import { getRequestId } from '@/shared/http/request-context';

const isProduction = env.NODE_ENV === 'production';

export const logger = pino({
    level: env.LOG_LEVEL,
    mixin() {
        const requestId = getRequestId();
        return requestId === undefined ? {} : { requestId };
    },
    formatters: { level: (label) => ({ level: label }) },
    timestamp: pino.stdTimeFunctions.isoTime,
    ...(isProduction
        ? {}
        : {
              transport: {
                  target: 'pino-pretty',
                  options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
              },
          }),
});

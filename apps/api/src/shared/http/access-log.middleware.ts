import pinoHttp from 'pino-http';
import { logger } from '@/shared/logging/logger';

const EXCLUDED_PATHS = new Set(['/api/health']);

export function accessLogMiddleware() {
    return pinoHttp({
        logger,
        customLogLevel: (_req, res, err) => {
            if (err || res.statusCode >= 500) return 'error';
            if (res.statusCode >= 400) return 'warn';
            return 'info';
        },
        autoLogging: {
            ignore: (req) => EXCLUDED_PATHS.has(req.url ?? ''),
        },
        serializers: {
            req: (req) => ({ method: req.method, url: req.url }),
            res: (res) => ({ statusCode: res.statusCode }),
        },
    });
}

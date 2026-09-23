import express from 'express';
import type { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from '@/config/env.js';
import { buildContainers } from './container.js';
import { buildApiRouter } from './routes.js';
import { accessLogMiddleware } from '@/shared/http/access-log.middleware.js';
import { errorHandler, notFoundHandler } from '@/shared/http/error-handler.js';
import { requestIdMiddleware } from '@/shared/http/request-id.middleware.js';
import { mountSwagger } from '@/shared/http/swagger.util.js';

export function createApp(): Express {
    const app = express();

    app.disable('x-powered-by');
    app.set('trust proxy', 1);

    // Request-id FIRST, ahead of everything else, so even a request rejected by helmet/cors is
    // still traceable.
    app.use(requestIdMiddleware());
    app.use(accessLogMiddleware());
    app.use(helmet());
    app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
    app.use(express.json());
    app.use(cookieParser());

    mountSwagger(app);

    // 1. Build all the Clean Architecture modules
    const containers = buildContainers();

    // 2. Wire their routes into Express at /api
    app.use('/api', buildApiRouter(containers));

    // Anything unmatched, then any error thrown along the way — in that order, both last.
    app.use(notFoundHandler);
    app.use(errorHandler);

    return app;
}

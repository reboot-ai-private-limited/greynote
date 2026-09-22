import express from 'express';
import type { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from '@/config/env';
import { buildContainers } from './container.js';
import { buildApiRouter } from './routes.js';
import { requestIdMiddleware } from '@/shared/http/request-id.middleware';
import { accessLogMiddleware } from '@/shared/http/access-log.middleware';
import { mountSwagger } from '@/shared/http/swagger.util';
import { notFoundHandler, errorHandler } from '@/shared/http/error-handler';

export function createApp(): Express {
    const app = express();

    app.disable('x-powered-by');
    app.set('trust proxy', 1);

    // Cross-cutting middleware, registered before anything else so even
    // rejected requests are traceable and protected.
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

    app.use(notFoundHandler);
    app.use(errorHandler);

    return app;
}

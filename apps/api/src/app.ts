import express from 'express';
import type { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from '@/config/env.js';
import { buildContainers, type AppContainers } from './container.js';
import { buildApiRouter } from './routes.js';
import { accessLogMiddleware } from '@/shared/http/access-log.middleware.js';
import { errorHandler, notFoundHandler } from '@/shared/http/error-handler.js';
import { requestIdMiddleware } from '@/shared/http/request-id.middleware.js';
import { mountSwagger } from '@/shared/http/swagger.util.js';

export interface CreateAppOptions {
    /** Called once with the built modules, for what the server runs besides requests (scheduled jobs). */
    onContainers?: (containers: AppContainers) => void;
}

export function createApp(options: CreateAppOptions = {}): Express {
    const app = express();

    app.disable('x-powered-by');
    app.set('trust proxy', 1);

    // Request-id FIRST, ahead of everything else, so even a request rejected by helmet/cors is
    // still traceable.
    app.use(requestIdMiddleware());
    app.use(accessLogMiddleware());
    app.use(helmet());
    app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
    // 2 MB, not the 100 KB default: a day's report is one push of up to `SYNC_MAX_BATCH` records.
    app.use(express.json({ limit: '2mb' }));
    app.use(cookieParser());

    // 1. Build all the Clean Architecture modules. Importing a module's route file (inside
    // buildRouter, called below) registers its OpenAPI paths as a side effect, so containers
    // MUST be built — and their routers built — before mountSwagger reads the registry.
    const containers = buildContainers();
    options.onContainers?.(containers);

    // 2. Wire their routes into Express at /api
    app.use('/api', buildApiRouter(containers));

    // 3. Now every route's OpenAPI registration has run.
    mountSwagger(app);

    // Anything unmatched, then any error thrown along the way — in that order, both last.
    app.use(notFoundHandler);
    app.use(errorHandler);

    return app;
}

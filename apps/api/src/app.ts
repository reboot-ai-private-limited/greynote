import express from 'express';
import type { Express } from 'express';
import { buildContainers } from './container.js';
import { buildApiRouter } from './routes.js';

export function createApp(): Express {
    const app = express();

    // Basic middleware
    app.use(express.json());

    // 1. Build all the Clean Architecture modules
    const containers = buildContainers();

    // 2. Wire their routes into Express at /api
    app.use('/api', buildApiRouter(containers));

    return app;
}

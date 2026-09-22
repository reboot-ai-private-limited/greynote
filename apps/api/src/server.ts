import { env } from '@/config/env';
import { logger } from '@/shared/logging/logger';
import { createApp } from './app.js';

const SHUTDOWN_TIMEOUT_MS = 15_000;

function start() {
    const app = createApp();

    const server = app.listen(env.PORT, () => {
        logger.info({ port: env.PORT, env: env.NODE_ENV }, 'api listening');
    });

    const shutdown = (signal: string) => {
        logger.info({ signal }, 'signal received, draining');

        const force = setTimeout(() => {
            logger.fatal('drain timed out, forcing exit');
            process.exit(1);
        }, SHUTDOWN_TIMEOUT_MS);
        force.unref();

        server.close(() => {
            logger.info('shutdown complete');
            process.exit(0);
        });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

start();

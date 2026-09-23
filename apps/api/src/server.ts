import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';
import { createApp } from './app.js';

const SHUTDOWN_TIMEOUT_MS = 15_000;

async function start() {
    try {
        await mongoose.connect(env.MONGO_URI);
    } catch (cause) {
        logger.fatal({ err: String(cause) }, 'failed to connect to MongoDB');
        process.exit(1);
    }
    logger.info('connected to MongoDB');

    const app = createApp();

    const server = app.listen(env.PORT, () => {
        logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Greynote API listening');
    });

    const shutdown = (signal: string) => {
        logger.info({ signal }, 'signal received, draining');

        const force = setTimeout(() => {
            logger.fatal('drain timed out, forcing exit');
            process.exit(1);
        }, SHUTDOWN_TIMEOUT_MS);
        force.unref();

        server.close(() => {
            mongoose
                .disconnect()
                .catch((cause: unknown) => logger.error({ err: String(cause) }, 'error disconnecting MongoDB'))
                .finally(() => {
                    logger.info('shutdown complete');
                    process.exit(0);
                });
        });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

start();

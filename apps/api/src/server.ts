import mongoose from 'mongoose';
import { env, isProduction } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';
import { SWAGGER_DOCS_PATH } from '@/shared/http/swagger.util.js';
import { startIntervalJob, type IntervalJob } from '@/shared/jobs/intervalJob.js';
import { createApp } from './app.js';

const SHUTDOWN_TIMEOUT_MS = 15_000;
/** How often the server looks for promotions whose month has come (it also looks once at start, which catches up a missed 1st). */
const PROMOTION_CHECK_MS = 60 * 60 * 1000;
/**
 * How often the server runs the missed-DCR check. It judges whole days ending yesterday, so it acts shortly after each day rolls over
 * (`DAY_START_TIME`); the rest of the time it finds nothing new. Safe to run at any time and from several servers (one open block per user).
 */
/** How often pending leaves that have already begun are rejected. Idempotent; the first day rolls over at `DAY_START_TIME`. */
const LATE_LEAVE_CHECK_MS = 30 * 60 * 1000;
const MISSED_DCR_CHECK_MS = 15 * 60 * 1000;

async function start() {
    try {
        await mongoose.connect(env.MONGO_URI);
    } catch (cause) {
        logger.fatal({ err: String(cause) }, 'failed to connect to MongoDB');
        process.exit(1);
    }
    logger.info('connected to MongoDB');

    const jobs: IntervalJob[] = [];
    const app = createApp({
        onContainers: ({ identity, fieldActivity, hr }) => {
            jobs.push(startIntervalJob('apply-due-promotions', PROMOTION_CHECK_MS, () => identity.applyDuePromotions()));
            jobs.push(startIntervalJob('expire-late-leaves', LATE_LEAVE_CHECK_MS, () => hr.expireLateLeaves()));
            jobs.push(startIntervalJob('missed-dcr-check', MISSED_DCR_CHECK_MS, () => fieldActivity.runMissedDcrCheck()));
        },
    });

    const server = app.listen(env.PORT, () => {
        logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Greynote API listening');

        if (!isProduction) {
            logger.info({ url: `http://localhost:${env.PORT}${SWAGGER_DOCS_PATH}` }, 'Swagger docs available');
        }
    });

    const shutdown = (signal: string) => {
        logger.info({ signal }, 'signal received, draining');

        const force = setTimeout(() => {
            logger.fatal('drain timed out, forcing exit');
            process.exit(1);
        }, SHUTDOWN_TIMEOUT_MS);
        force.unref();

        for (const job of jobs) job.stop();

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

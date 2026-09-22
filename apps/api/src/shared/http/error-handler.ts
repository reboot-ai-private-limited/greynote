import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '@/shared/errors/AppError';
import { buildErrorBody } from '@/shared/http/response.util';
import { logger } from '@/shared/logging/logger';

export function notFoundHandler(req: Request, res: Response): void {
    res.status(404).json(
        buildErrorBody(req, {
            statusCode: 404,
            code: 'NOT_FOUND',
            message: `Route not found: ${req.method} ${req.originalUrl}`,
        }),
    );
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
    if (err instanceof AppError) {
        if (err.isExpected) {
            logger.info({ code: err.code, details: err.details }, err.message);
        } else {
            logger.error({ code: err.code, details: err.details, err }, err.message);
        }

        res.status(err.statusCode).json(
            buildErrorBody(req, {
                statusCode: err.statusCode,
                code: err.code,
                message: err.message,
                data: err.publicDetails,
            }),
        );
        return;
    }

    if (err instanceof ZodError) {
        res.status(400).json(
            buildErrorBody(req, {
                statusCode: 400,
                code: 'VALIDATION_FAILED',
                message: 'Request validation failed',
                data: err.issues,
            }),
        );
        return;
    }

    logger.error({ err }, 'unhandled error');
    res.status(500).json(
        buildErrorBody(req, {
            statusCode: 500,
            code: 'INTERNAL',
            message: 'Internal server error',
        }),
    );
}

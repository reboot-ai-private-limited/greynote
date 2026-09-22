import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { runWithRequestContext } from '@/shared/http/request-context';

export function requestIdMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
        const requestId = (req.headers['x-request-id'] as string | undefined) || randomUUID();

        res.locals.requestId = requestId;
        res.setHeader('x-request-id', requestId);

        runWithRequestContext({ requestId }, next);
    };
}

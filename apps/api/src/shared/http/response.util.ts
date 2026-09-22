import type { Request, Response } from 'express';
import { getRequestId } from '@/shared/http/request-context';

export interface RequestMeta {
    method: string;
    url: string;
    requestId?: string;
}

export interface HttpSuccessBody<T = unknown> {
    success: true;
    statusCode: number;
    request: RequestMeta;
    message: string;
    data: T;
}

export interface HttpErrorBody {
    success: false;
    statusCode: number;
    code: string;
    request: RequestMeta;
    message: string;
    data?: unknown;
}

export type HttpBody<T = unknown> = HttpSuccessBody<T> | HttpErrorBody;

function meta(req: Request): RequestMeta {
    return { method: req.method, url: req.originalUrl, requestId: getRequestId() };
}

export function sendSuccess<T>(
    req: Request,
    res: Response,
    data: T,
    message = 'OK',
    statusCode = 200,
): void {
    const body: HttpSuccessBody<T> = {
        success: true,
        statusCode,
        request: meta(req),
        message,
        data,
    };
    res.status(statusCode).json(body);
}

export interface BuildErrorBodyOptions {
    statusCode: number;
    code: string;
    message: string;
    data?: unknown;
}

export function buildErrorBody(req: Request, options: BuildErrorBodyOptions): HttpErrorBody {
    return {
        success: false,
        statusCode: options.statusCode,
        code: options.code,
        request: meta(req),
        message: options.message,
        data: options.data,
    };
}

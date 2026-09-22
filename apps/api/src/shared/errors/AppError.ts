export interface AppErrorOptions {
    statusCode: number;
    code: string;
    message: string;
    publicDetails?: unknown;
    details?: unknown;
    isExpected?: boolean;
    cause?: unknown;
}

export class AppError extends Error {
    readonly statusCode: number;
    readonly code: string;
    readonly publicDetails?: unknown;
    readonly details?: unknown;
    readonly isExpected: boolean;

    constructor(options: AppErrorOptions) {
        super(options.message, { cause: options.cause });
        this.name = 'AppError';
        this.statusCode = options.statusCode;
        this.code = options.code;
        this.publicDetails = options.publicDetails;
        this.details = options.details;
        this.isExpected = options.isExpected ?? true;
    }

    static badRequest(message: string, publicDetails?: unknown): AppError {
        return new AppError({ statusCode: 400, code: 'BAD_REQUEST', message, publicDetails });
    }

    static unauthenticated(message = 'Authentication required'): AppError {
        return new AppError({ statusCode: 401, code: 'UNAUTHENTICATED', message });
    }

    static forbidden(message = 'Forbidden'): AppError {
        return new AppError({ statusCode: 403, code: 'FORBIDDEN', message });
    }

    static notFound(message = 'Not found'): AppError {
        return new AppError({ statusCode: 404, code: 'NOT_FOUND', message });
    }

    static conflict(message: string, publicDetails?: unknown): AppError {
        return new AppError({ statusCode: 409, code: 'CONFLICT', message, publicDetails });
    }

    static internal(code: string, details?: unknown, cause?: unknown): AppError {
        return new AppError({
            statusCode: 500,
            code,
            message: 'Internal server error',
            details,
            cause,
            isExpected: false,
        });
    }
}

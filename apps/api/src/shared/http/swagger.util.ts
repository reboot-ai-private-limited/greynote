import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import swaggerUi from 'swagger-ui-express';
import type { Express } from 'express';
import { env } from '@/config/env';

export const openApiRegistry = new OpenAPIRegistry();

openApiRegistry.registerPath({
    method: 'get',
    path: '/api/health',
    summary: 'Report service health',
    responses: {
        200: { description: 'Service is healthy' },
        503: { description: 'Service is degraded' },
    },
});

function buildOpenApiDocument() {
    const generator = new OpenApiGeneratorV3(openApiRegistry.definitions);
    return generator.generateDocument({
        openapi: '3.0.0',
        info: { title: 'Greynote API', version: '1.0.0' },
    });
}

export function mountSwagger(app: Express): void {
    if (env.NODE_ENV === 'production') return;

    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(buildOpenApiDocument()));
}

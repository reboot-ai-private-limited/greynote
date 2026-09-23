import { OpenAPIRegistry, OpenApiGeneratorV3, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import swaggerUi from 'swagger-ui-express';
import type { Express } from 'express';
import { z } from 'zod';
import { env } from '@/config/env.js';

// Patches Zod's prototype with `.openapi(...)` — must run before any route file's module-scope
// `registerPath` call uses it or a Zod schema as a request body/query/params shape. Every route
// file imports `openApiRegistry` from this module, so this side effect runs exactly once, before
// any of them.
extendZodWithOpenApi(z);

/**
 * Shared OpenAPI registry singleton. Each module calls `openApiRegistry.registerPath(...)` in
 * its own `interface/*.route.ts`, next to the route it documents — one definition (the same Zod
 * schema validates the request and describes it in Swagger), not two to keep in sync, and no
 * single file growing a registration call per route across every module.
 *
 * Registering paths is therefore a side effect of *importing* a route file — `mountSwagger` must
 * run only after every module's routes have been built (see `app.ts`), or its document is built
 * from whatever happened to be registered before that point.
 */
export const openApiRegistry = new OpenAPIRegistry();

/** Referenced by every authenticated route's `security: [{ bearerAuth: [] }]`. */
openApiRegistry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});

/**
 * Declared explicitly, in this order, so Swagger UI groups routes by module instead of one flat
 * list — without a top-level `tags` array it falls back to alphabetical-by-first-appearance,
 * which reads oddly here (`Auth, Designations, Pay Bands, Roles, Users`). Each route file's
 * `registerPath` call sets a matching `tags: ['...']` next to the route it documents.
 */
const TAGS = [
  { name: 'Health', description: 'Service health check.' },
  { name: 'Identity / Auth', description: 'Login, refresh, logout.' },
  { name: 'Identity / Users', description: 'User accounts and FIELD onboarding.' },
  { name: 'Identity / Roles', description: 'Role master data.' },
  { name: 'Identity / Designations', description: 'Designation master data.' },
  { name: 'Identity / Pay Bands', description: 'Pay band master data.' },
];

function buildOpenApiDocument() {
  const generator = new OpenApiGeneratorV3(openApiRegistry.definitions);
  return generator.generateDocument({
    openapi: '3.0.0',
    info: { title: 'Greynote API', version: '1.0.0' },
    tags: TAGS,
  });
}

export function mountSwagger(app: Express): void {
  if (env.NODE_ENV === 'production') return;

  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(buildOpenApiDocument()));
}

import { Router } from 'express';
import type { AnyZodObject, ZodTypeAny } from 'zod';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import { validate } from '@/shared/http/validate.middleware.js';
import type { CrudHandlers } from './field-master-data.controller.js';
import {
  createChemistBodySchema,
  createProductBodySchema,
  idParamsSchema,
  listChemistsQuerySchema,
  listProductsQuerySchema,
  updateChemistBodySchema,
  updateProductBodySchema,
} from './field-master-data.schemas.js';

const TAG = 'Field Master Data';
const bearer = [{ bearerAuth: [] }];
const json = (schema: ZodTypeAny) => ({ content: { 'application/json': { schema } } });

function doc(
  method: 'get' | 'post' | 'patch',
  path: string,
  summary: string,
  request: { query?: AnyZodObject; params?: AnyZodObject; body?: ZodTypeAny } = {},
): void {
  openApiRegistry.registerPath({
    method,
    path: `/api/field-master-data${path}`,
    tags: [TAG],
    summary,
    security: bearer,
    request: {
      ...(request.query && { query: request.query }),
      ...(request.params && { params: request.params }),
      ...(request.body && { body: json(request.body) }),
    },
    responses: { 200: { description: 'OK' } },
  });
}

doc('get', '/products', 'Admin: list products', { query: listProductsQuerySchema });
doc('post', '/products', 'Admin: add a product', { body: createProductBodySchema });
doc('get', '/products/{id}', 'Admin: one product', { params: idParamsSchema });
doc('patch', '/products/{id}', 'Admin: edit or deactivate a product', { params: idParamsSchema, body: updateProductBodySchema });
doc('get', '/chemists', 'Admin: list chemists', { query: listChemistsQuerySchema });
doc('post', '/chemists', 'Admin: add a chemist on a route, with a map-picked location', { body: createChemistBodySchema });
doc('get', '/chemists/{id}', 'Admin: one chemist', { params: idParamsSchema });
doc('patch', '/chemists/{id}', 'Admin: edit a chemist, including correcting its location', { params: idParamsSchema, body: updateChemistBodySchema });

function crudRouter(
  c: CrudHandlers,
  schemas: { list: AnyZodObject; create: ZodTypeAny; update: ZodTypeAny },
): Router {
  const router = Router();
  router.use(authenticate(), requireRole('ADMIN'));
  router.get('/', validate({ query: schemas.list }), c.list);
  router.post('/', validate({ body: schemas.create }), c.create);
  router.get('/:id', validate({ params: idParamsSchema }), c.get);
  router.patch('/:id', validate({ params: idParamsSchema, body: schemas.update }), c.update);
  return router;
}

export function buildFieldMasterDataRouter(c: { products: CrudHandlers; chemists: CrudHandlers }): Router {
  const router = Router();
  router.use('/products', crudRouter(c.products, { list: listProductsQuerySchema, create: createProductBodySchema, update: updateProductBodySchema }));
  router.use('/chemists', crudRouter(c.chemists, { list: listChemistsQuerySchema, create: createChemistBodySchema, update: updateChemistBodySchema }));
  return router;
}

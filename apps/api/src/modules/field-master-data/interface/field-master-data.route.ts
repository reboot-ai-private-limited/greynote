import { Router } from 'express';
import type { AnyZodObject, ZodTypeAny } from 'zod';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import { validate } from '@/shared/http/validate.middleware.js';
import type { CrudHandlers, DoctorHandlers } from './field-master-data.controller.js';
import {
  assignDoctorBodySchema,
  createChemistBodySchema,
  createDoctorBodySchema,
  createProductBodySchema,
  doctorAssignmentParamsSchema,
  idParamsSchema,
  listAssignedDoctorsQuerySchema,
  listChemistsQuerySchema,
  listDoctorsQuerySchema,
  listProductsQuerySchema,
  teamDoctorsQuerySchema,
  updateChemistBodySchema,
  updateDoctorBodySchema,
  updateProductBodySchema,
} from './field-master-data.schemas.js';

const TAG = 'Field Master Data';
const bearer = [{ bearerAuth: [] }];
const json = (schema: ZodTypeAny) => ({ content: { 'application/json': { schema } } });

function doc(
  method: 'get' | 'post' | 'patch' | 'delete',
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

doc('get', '/doctors', 'Admin: list doctors', { query: listDoctorsQuerySchema });
doc('post', '/doctors', 'Admin: add a doctor on a route, with a map-picked location', { body: createDoctorBodySchema });
doc('get', '/doctors/mine', 'Field staff: the doctors assigned to me, on routes I still have', { query: listAssignedDoctorsQuerySchema });
doc('get', '/doctors/team', 'Managers: the doctors of everyone in my downline', { query: teamDoctorsQuerySchema });
doc('get', '/doctors/{id}', 'A doctor — Admin, the assigned MR, or their manager', { params: idParamsSchema });
doc('patch', '/doctors/{id}', 'Admin: edit a doctor, including correcting its location', { params: idParamsSchema, body: updateDoctorBodySchema });
doc('get', '/doctors/{id}/assignments', 'Admin: who has been responsible for a doctor', { params: idParamsSchema });
doc('post', '/doctors/{id}/assignments', 'Admin: make an MR responsible for a doctor, replacing the current one', { params: idParamsSchema, body: assignDoctorBodySchema });
doc('delete', '/doctors/{id}/assignments/{userId}', 'Admin: remove an MR’s assignment', { params: doctorAssignmentParamsSchema });

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

/** Field staff read their own Doctors; everything else is Admin's. `/mine` and `/team` come before `/:id`. */
function doctorsRouter(c: DoctorHandlers): Router {
  const router = Router();
  router.use(authenticate());
  const admin = requireRole('ADMIN');
  const field = requireRole('FIELD');
  router.get('/mine', field, validate({ query: listAssignedDoctorsQuerySchema }), c.mine);
  router.get('/team', field, validate({ query: teamDoctorsQuerySchema }), c.team);
  router.get('/', admin, validate({ query: listDoctorsQuerySchema }), c.list);
  router.post('/', admin, validate({ body: createDoctorBodySchema }), c.create);
  // Admin, or a FIELD employee the use case checks (the assigned MR, or their manager).
  router.get('/:id', requireRole('ADMIN', 'FIELD'), validate({ params: idParamsSchema }), c.get);
  router.patch('/:id', admin, validate({ params: idParamsSchema, body: updateDoctorBodySchema }), c.update);
  router.get('/:id/assignments', admin, validate({ params: idParamsSchema }), c.listAssignments);
  router.post('/:id/assignments', admin, validate({ params: idParamsSchema, body: assignDoctorBodySchema }), c.assign);
  router.delete('/:id/assignments/:userId', admin, validate({ params: doctorAssignmentParamsSchema }), c.unassign);
  return router;
}

export function buildFieldMasterDataRouter(c: { products: CrudHandlers; chemists: CrudHandlers; doctors: DoctorHandlers }): Router {
  const router = Router();
  router.use('/doctors', doctorsRouter(c.doctors));
  router.use('/products', crudRouter(c.products, { list: listProductsQuerySchema, create: createProductBodySchema, update: updateProductBodySchema }));
  router.use('/chemists', crudRouter(c.chemists, { list: listChemistsQuerySchema, create: createChemistBodySchema, update: updateChemistBodySchema }));
  return router;
}

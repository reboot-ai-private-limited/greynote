import { Router } from 'express';
import type { AnyZodObject, ZodTypeAny } from 'zod';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import { validate } from '@/shared/http/validate.middleware.js';
import type { CrudHandlers, DoctorHandlers } from './field-master-data.controller.js';
import {
  addDoctorBodySchema,
  adjustSampleBodySchema,
  assignDoctorBodySchema,
  createChemistBodySchema,
  createDistributorBodySchema,
  createDoctorBodySchema,
  createProductBodySchema,
  doctorAssignmentParamsSchema,
  editAddedDoctorBodySchema,
  idParamsSchema,
  issueSampleBodySchema,
  listAddedDoctorsQuerySchema,
  listAssignedDoctorsQuerySchema,
  listChemistsQuerySchema,
  listDistributorsQuerySchema,
  listDoctorsQuerySchema,
  listProductsQuerySchema,
  sampleAllocationParamsSchema,
  teamDoctorsQuerySchema,
  updateChemistBodySchema,
  updateDistributorBodySchema,
  updateDoctorBodySchema,
  updateProductBodySchema,
} from './field-master-data.schemas.js';

const TAG = 'Field Master Data';
const bearer = [{ bearerAuth: [] }];
const json = (schema: ZodTypeAny) => ({ content: { 'application/json': { schema } } });

function doc(
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
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
doc('get', '/doctors/added', 'Field staff: the doctors I added, with where each is in its approval', { query: listAddedDoctorsQuerySchema });
doc('post', '/doctors/added', 'Field staff: add a doctor (offline-first) — it goes to my manager, then Admin', { body: addDoctorBodySchema });
doc('put', '/doctors/added/{id}', 'Field staff: change a rejected, withdrawn or reopened doctor — resubmits it', { params: idParamsSchema, body: editAddedDoctorBodySchema });
doc('get', '/doctors/{id}', 'A doctor — Admin, the assigned MR, or their manager', { params: idParamsSchema });
doc('patch', '/doctors/{id}', 'Admin: edit a doctor, including correcting its location', { params: idParamsSchema, body: updateDoctorBodySchema });
doc('get', '/doctors/{id}/assignments', 'Admin: who has been responsible for a doctor', { params: idParamsSchema });
doc('post', '/doctors/{id}/assignments', 'Admin: make an MR responsible for a doctor, replacing the current one', { params: idParamsSchema, body: assignDoctorBodySchema });
doc('delete', '/doctors/{id}/assignments/{userId}', 'Admin: remove an MR’s assignment', { params: doctorAssignmentParamsSchema });

doc('get', '/distributors', 'Admin: list distributors, by route or the HQ / zone above it', { query: listDistributorsQuerySchema });
doc('post', '/distributors', 'Admin: add a distributor on a route', { body: createDistributorBodySchema });
doc('get', '/distributors/{id}', 'Admin: one distributor, with its zone → HQ → route breadcrumb', { params: idParamsSchema });
doc('patch', '/distributors/{id}', 'Admin: edit a distributor, reassign its MR / ASM', { params: idParamsSchema, body: updateDistributorBodySchema });
doc('get', '/doctors/{id}/sample-allocations', 'A doctor’s sample allocations and what is left — Admin, the assigned MR, or their manager', { params: idParamsSchema });
doc('post', '/doctors/{id}/sample-allocations', 'Admin: issue samples of a product for a doctor (adds to an existing allocation)', { params: idParamsSchema, body: issueSampleBodySchema });
doc('patch', '/doctors/{id}/sample-allocations/{productId}', 'Admin: correct the allocated total (not below what was given out)', { params: sampleAllocationParamsSchema, body: adjustSampleBodySchema });

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

/** Field staff read their own Doctors and add new ones; everything else is Admin's. `/added`, `/mine` and `/team` come before `/:id`. */
function doctorsRouter(c: DoctorHandlers): Router {
  const router = Router();
  router.use(authenticate());
  const admin = requireRole('ADMIN');
  const field = requireRole('FIELD');
  router.get('/mine', field, validate({ query: listAssignedDoctorsQuerySchema }), c.mine);
  router.get('/team', field, validate({ query: teamDoctorsQuerySchema }), c.team);
  router.get('/added', field, validate({ query: listAddedDoctorsQuerySchema }), c.added);
  router.post('/added', field, validate({ body: addDoctorBodySchema }), c.addDoctor);
  router.put('/added/:id', field, validate({ params: idParamsSchema, body: editAddedDoctorBodySchema }), c.editAdded);
  router.get('/', admin, validate({ query: listDoctorsQuerySchema }), c.list);
  router.post('/', admin, validate({ body: createDoctorBodySchema }), c.create);
  // Admin, or a FIELD employee the use case checks (the assigned MR, or their manager).
  router.get('/:id', requireRole('ADMIN', 'FIELD'), validate({ params: idParamsSchema }), c.get);
  router.patch('/:id', admin, validate({ params: idParamsSchema, body: updateDoctorBodySchema }), c.update);
  router.get('/:id/assignments', admin, validate({ params: idParamsSchema }), c.listAssignments);
  router.post('/:id/assignments', admin, validate({ params: idParamsSchema, body: assignDoctorBodySchema }), c.assign);
  router.get('/:id/sample-allocations', requireRole('ADMIN', 'FIELD'), validate({ params: idParamsSchema }), c.listSamples);
  router.post('/:id/sample-allocations', admin, validate({ params: idParamsSchema, body: issueSampleBodySchema }), c.issueSample);
  router.patch('/:id/sample-allocations/:productId', admin, validate({ params: sampleAllocationParamsSchema, body: adjustSampleBodySchema }), c.adjustSample);
  router.delete('/:id/assignments/:userId', admin, validate({ params: doctorAssignmentParamsSchema }), c.unassign);
  return router;
}

export function buildFieldMasterDataRouter(c: {
  products: CrudHandlers;
  chemists: CrudHandlers;
  distributors: CrudHandlers;
  doctors: DoctorHandlers;
}): Router {
  const router = Router();
  router.use('/doctors', doctorsRouter(c.doctors));
  router.use('/products', crudRouter(c.products, { list: listProductsQuerySchema, create: createProductBodySchema, update: updateProductBodySchema }));
  router.use(
    '/distributors',
    crudRouter(c.distributors, { list: listDistributorsQuerySchema, create: createDistributorBodySchema, update: updateDistributorBodySchema }),
  );
  router.use('/chemists', crudRouter(c.chemists, { list: listChemistsQuerySchema, create: createChemistBodySchema, update: updateChemistBodySchema }));
  return router;
}

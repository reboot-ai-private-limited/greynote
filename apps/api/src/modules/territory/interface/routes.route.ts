import { Router, type RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { validate } from '@/shared/http/validate.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import {
  assignRouteBodySchema,
  createPlaceBodySchema,
  createRouteBodySchema,
  listPlacesQuerySchema,
  listRouteAssignmentsQuerySchema,
  routeAssignmentParamsSchema,
  listRoutesQuerySchema,
  searchPlacesQuerySchema,
  territoryIdParamsSchema,
  updatePlaceBodySchema,
  updateRouteBodySchema,
} from './territory.schemas.js';

const ROUTES_TAG = 'Territory / Routes';
const bearer = [{ bearerAuth: [] }];
const json = (schema: ZodTypeAny) => ({ content: { 'application/json': { schema } } });

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/territory/places/search',
  tags: [ROUTES_TAG],
  summary: 'Admin: search places for a registered location (Google Places proxy)',
  security: bearer,
  request: { query: searchPlacesQuerySchema },
  responses: { 200: { description: 'Candidates with coordinates' }, 503: { description: 'Google unavailable' } },
});
openApiRegistry.registerPath({
  method: 'get',
  path: '/api/territory/places',
  tags: [ROUTES_TAG],
  summary: 'Admin, Accountant, HR: list places (towns and stations), optionally by HQ, Zone or type; the HQ town first',
  security: bearer,
  request: { query: listPlacesQuerySchema },
  responses: { 200: { description: 'Places listed' } },
});
openApiRegistry.registerPath({
  method: 'post',
  path: '/api/territory/places',
  tags: [ROUTES_TAG],
  summary: 'Admin: create a place under an HQ, with the DA type a day there pays that HQ\'s people',
  security: bearer,
  request: { body: json(createPlaceBodySchema) },
  responses: { 201: { description: 'Place created' } },
});
openApiRegistry.registerPath({
  method: 'patch',
  path: '/api/territory/places/{id}',
  tags: [ROUTES_TAG],
  summary: 'Admin: rename, re-type, deactivate or reactivate a place (its routes follow). Not the HQ town: it follows its HQ.',
  security: bearer,
  request: { params: territoryIdParamsSchema, body: json(updatePlaceBodySchema) },
  responses: { 200: { description: 'Place updated' } },
});
openApiRegistry.registerPath({
  method: 'get',
  path: '/api/territory/routes',
  tags: [ROUTES_TAG],
  summary: 'Admin: list routes, optionally by HQ, Zone or type',
  security: bearer,
  request: { query: listRoutesQuerySchema },
  responses: { 200: { description: 'Routes listed' } },
});
openApiRegistry.registerPath({
  method: 'post',
  path: '/api/territory/routes',
  tags: [ROUTES_TAG],
  summary: 'Admin: create a route between two places with its one-way km and TA (grade rate, own rate per km, or a fixed amount). The older HQ + destination form is still accepted.',
  security: bearer,
  request: { body: json(createRouteBodySchema) },
  responses: { 201: { description: 'Route created' } },
});
openApiRegistry.registerPath({
  method: 'get',
  path: '/api/territory/routes/{id}',
  tags: [ROUTES_TAG],
  summary: 'Admin: route detail',
  security: bearer,
  request: { params: territoryIdParamsSchema },
  responses: { 200: { description: 'Route fetched' } },
});
openApiRegistry.registerPath({
  method: 'patch',
  path: '/api/territory/routes/{id}',
  tags: [ROUTES_TAG],
  summary: 'Admin: change the destination, km or type, deactivate/reactivate, or set/clear the TA per-km rate override',
  security: bearer,
  request: { params: territoryIdParamsSchema, body: json(updateRouteBodySchema) },
  responses: { 200: { description: 'Route updated' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/api/territory/routes/{id}/assignments',
  tags: [ROUTES_TAG],
  summary: 'Admin: assign a field employee to this route',
  security: bearer,
  request: { params: territoryIdParamsSchema, body: json(assignRouteBodySchema) },
  responses: { 201: { description: 'Assigned' }, 409: { description: 'Already assigned, or route/employee inactive' } },
});
openApiRegistry.registerPath({
  method: 'get',
  path: '/api/territory/routes/{id}/assignments',
  tags: [ROUTES_TAG],
  summary: 'Admin: who covers this route (all history unless filtered by status)',
  security: bearer,
  request: { params: territoryIdParamsSchema, query: listRouteAssignmentsQuerySchema },
  responses: { 200: { description: 'Assignments listed' } },
});
openApiRegistry.registerPath({
  method: 'delete',
  path: '/api/territory/routes/{id}/assignments/{userId}',
  tags: [ROUTES_TAG],
  summary: 'Admin: end an employee\'s assignment (kept as history)',
  security: bearer,
  request: { params: routeAssignmentParamsSchema },
  responses: { 200: { description: 'Unassigned' }, 404: { description: 'Not currently assigned' } },
});
openApiRegistry.registerPath({
  method: 'get',
  path: '/api/territory/my-routes',
  tags: [ROUTES_TAG],
  summary: 'Field employee: my active routes (for the Daily Plan route picker)',
  security: bearer,
  responses: { 200: { description: 'Routes with HQ name, type and distance' } },
});

export function buildRoutesRouter(controllers: {
  list: RequestHandler;
  create: RequestHandler;
  update: RequestHandler;
  get: RequestHandler;
  assign: RequestHandler;
  listAssignments: RequestHandler;
  unassign: RequestHandler;
}): Router {
  const router = Router();
  router.use(authenticate());
  const admin = requireRole('ADMIN');
  // The Accountant reads the list (the distributor form's route picker); everything else here is Admin's.
  const withId = (body?: Parameters<typeof validate>[0]['body']) =>
    validate({ params: territoryIdParamsSchema, ...(body && { body }) });

  router.get('/', requireRole('ADMIN', 'ACCOUNTANT', 'HR'), validate({ query: listRoutesQuerySchema }), controllers.list);
  router.post('/', admin, validate({ body: createRouteBodySchema }), controllers.create);
  router.get('/:id', admin, withId(), controllers.get);
  router.patch('/:id', admin, withId(updateRouteBodySchema), controllers.update);
  router.post('/:id/assignments', admin, withId(assignRouteBodySchema), controllers.assign);
  router.get(
    '/:id/assignments',
    admin,
    validate({ params: territoryIdParamsSchema, query: listRouteAssignmentsQuerySchema }),
    controllers.listAssignments,
  );
  router.delete('/:id/assignments/:userId', admin, validate({ params: routeAssignmentParamsSchema }), controllers.unassign);
  return router;
}

export function buildPlacesRouter(controllers: { search: RequestHandler; list: RequestHandler; create: RequestHandler; update: RequestHandler }): Router {
  const router = Router();
  router.use(authenticate());
  // `/search` (Google, for a doctor's map pin) before `/:id`.
  router.get('/search', requireRole('ADMIN'), validate({ query: searchPlacesQuerySchema }), controllers.search);
  router.get('/', requireRole('ADMIN', 'ACCOUNTANT', 'HR'), validate({ query: listPlacesQuerySchema }), controllers.list);
  router.post('/', requireRole('ADMIN'), validate({ body: createPlaceBodySchema }), controllers.create);
  router.patch('/:id', requireRole('ADMIN'), validate({ params: territoryIdParamsSchema, body: updatePlaceBodySchema }), controllers.update);
  return router;
}

export function buildMyRoutesRouter(myRoutes: RequestHandler): Router {
  const router = Router();
  router.get('/', authenticate(), requireRole('FIELD'), myRoutes);
  return router;
}

import { Router, type RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { validate } from '@/shared/http/validate.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import {
  assignRouteBodySchema,
  createRouteBodySchema,
  listRouteAssignmentsQuerySchema,
  routeAssignmentParamsSchema,
  listRoutesQuerySchema,
  overrideRouteDistanceBodySchema,
  searchPlacesQuerySchema,
  territoryIdParamsSchema,
  updateRouteBodySchema,
  updateRouteWaypointsBodySchema,
} from './territory.schemas.js';

const ROUTES_TAG = 'Territory / Routes';
const bearer = [{ bearerAuth: [] }];
const json = (schema: ZodTypeAny) => ({ content: { 'application/json': { schema } } });

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/territory/places/search',
  tags: [ROUTES_TAG],
  summary: 'Admin: search places to use as waypoints (Google Places proxy)',
  security: bearer,
  request: { query: searchPlacesQuerySchema },
  responses: { 200: { description: 'Candidates with coordinates' }, 503: { description: 'Google unavailable' } },
});
openApiRegistry.registerPath({
  method: 'get',
  path: '/api/territory/routes',
  tags: [ROUTES_TAG],
  summary: 'Admin: list routes, optionally by Area or HQ',
  security: bearer,
  request: { query: listRoutesQuerySchema },
  responses: { 200: { description: 'Routes listed' } },
});
openApiRegistry.registerPath({
  method: 'post',
  path: '/api/territory/routes',
  tags: [ROUTES_TAG],
  summary: 'Admin: create a route — calculates its road distance',
  security: bearer,
  request: { body: json(createRouteBodySchema) },
  responses: { 201: { description: 'Route created (distanceStatus FAILED if Google could not answer)' } },
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
  summary: 'Admin: rename, deactivate/reactivate, or set/clear the TA per-km rate override',
  security: bearer,
  request: { params: territoryIdParamsSchema, body: json(updateRouteBodySchema) },
  responses: { 200: { description: 'Route updated' } },
});
openApiRegistry.registerPath({
  method: 'patch',
  path: '/api/territory/routes/{id}/waypoints',
  tags: [ROUTES_TAG],
  summary: 'Admin: replace waypoints — recalculates distance and clears any manual override',
  security: bearer,
  request: { params: territoryIdParamsSchema, body: json(updateRouteWaypointsBodySchema) },
  responses: { 200: { description: 'Waypoints updated' }, 409: { description: 'Stale revision' } },
});
openApiRegistry.registerPath({
  method: 'patch',
  path: '/api/territory/routes/{id}/distance',
  tags: [ROUTES_TAG],
  summary: 'Admin: manually override the distance (until the next waypoint edit)',
  security: bearer,
  request: { params: territoryIdParamsSchema, body: json(overrideRouteDistanceBodySchema) },
  responses: { 200: { description: 'Distance overridden' } },
});
openApiRegistry.registerPath({
  method: 'post',
  path: '/api/territory/routes/{id}/recalculate',
  tags: [ROUTES_TAG],
  summary: 'Admin: retry the distance calculation — clears any manual override',
  security: bearer,
  request: { params: territoryIdParamsSchema },
  responses: { 200: { description: 'Recalculated (check distanceStatus)' } },
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
  responses: { 200: { description: 'Routes with Area name/type and distance' } },
});

export function buildRoutesRouter(controllers: {
  list: RequestHandler;
  create: RequestHandler;
  update: RequestHandler;
  get: RequestHandler;
  updateWaypoints: RequestHandler;
  overrideDistance: RequestHandler;
  recalculate: RequestHandler;
  assign: RequestHandler;
  listAssignments: RequestHandler;
  unassign: RequestHandler;
}): Router {
  const router = Router();
  router.use(authenticate(), requireRole('ADMIN'));
  const withId = (body?: Parameters<typeof validate>[0]['body']) =>
    validate({ params: territoryIdParamsSchema, ...(body && { body }) });

  router.get('/', validate({ query: listRoutesQuerySchema }), controllers.list);
  router.post('/', validate({ body: createRouteBodySchema }), controllers.create);
  router.get('/:id', withId(), controllers.get);
  router.patch('/:id', withId(updateRouteBodySchema), controllers.update);
  router.patch('/:id/waypoints', withId(updateRouteWaypointsBodySchema), controllers.updateWaypoints);
  router.patch('/:id/distance', withId(overrideRouteDistanceBodySchema), controllers.overrideDistance);
  router.post('/:id/recalculate', withId(), controllers.recalculate);
  router.post('/:id/assignments', withId(assignRouteBodySchema), controllers.assign);
  router.get(
    '/:id/assignments',
    validate({ params: territoryIdParamsSchema, query: listRouteAssignmentsQuerySchema }),
    controllers.listAssignments,
  );
  router.delete('/:id/assignments/:userId', validate({ params: routeAssignmentParamsSchema }), controllers.unassign);
  return router;
}

export function buildPlacesRouter(search: RequestHandler): Router {
  const router = Router();
  router.get('/search', authenticate(), requireRole('ADMIN'), validate({ query: searchPlacesQuerySchema }), search);
  return router;
}

export function buildMyRoutesRouter(myRoutes: RequestHandler): Router {
  const router = Router();
  router.get('/', authenticate(), requireRole('FIELD'), myRoutes);
  return router;
}

import { Router } from 'express';
import type { AnyZodObject, ZodSchema } from 'zod';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { validate } from '@/shared/http/validate.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import type { CreateHqUseCase } from '../application/usecases/createHq.usecase.js';
import type { CreateZoneUseCase } from '../application/usecases/createZone.usecase.js';
import type { ListHqsUseCase } from '../application/usecases/listHqs.usecase.js';
import type { ListZonesUseCase } from '../application/usecases/listZones.usecase.js';
import type { UpdateHqUseCase } from '../application/usecases/updateHq.usecase.js';
import type { UpdateZoneUseCase } from '../application/usecases/updateZone.usecase.js';
import { makeHierarchyController } from './hierarchy.controller.js';
import {
  createHqBodySchema,
  createZoneBodySchema,
  listHqsQuerySchema,
  listZonesQuerySchema,
  territoryIdParamsSchema,
  updateHqBodySchema,
  updateZoneBodySchema,
} from './territory.schemas.js';

interface LevelSpec {
  /** URL segment under `/api/territory`, e.g. `zones`. */
  segment: string;
  tag: string;
  noun: string;
  listQuery: AnyZodObject;
  createBody: ZodSchema;
  updateBody: ZodSchema;
  updateSummary: string;
}

const LEVELS = {
  zones: {
    segment: 'zones',
    tag: 'Territory / Zones',
    noun: 'zone',
    listQuery: listZonesQuerySchema,
    createBody: createZoneBodySchema,
    updateBody: updateZoneBodySchema,
    updateSummary: 'rename, deactivate (only with no active HQs) or reactivate',
  },
  hqs: {
    segment: 'hqs',
    tag: 'Territory / HQs',
    noun: 'HQ',
    listQuery: listHqsQuerySchema,
    createBody: createHqBodySchema,
    updateBody: updateHqBodySchema,
    updateSummary: 'rename (re-names its routes), deactivate (only with no active routes) or reactivate',
  },
} satisfies Record<string, LevelSpec>;

function registerDocs(spec: LevelSpec): void {
  const path = `/api/territory/${spec.segment}`;
  openApiRegistry.registerPath({
    method: 'get',
    path,
    tags: [spec.tag],
    summary: `Admin: list ${spec.noun}s`,
    security: [{ bearerAuth: [] }],
    request: { query: spec.listQuery },
    responses: { 200: { description: `${spec.noun}s listed` } },
  });
  openApiRegistry.registerPath({
    method: 'post',
    path,
    tags: [spec.tag],
    summary: `Admin: create a ${spec.noun}`,
    security: [{ bearerAuth: [] }],
    request: { body: { content: { 'application/json': { schema: spec.createBody } } } },
    responses: { 201: { description: `${spec.noun} created` } },
  });
  openApiRegistry.registerPath({
    method: 'patch',
    path: `${path}/{id}`,
    tags: [spec.tag],
    summary: `Admin: ${spec.updateSummary}`,
    security: [{ bearerAuth: [] }],
    request: {
      params: territoryIdParamsSchema,
      body: { content: { 'application/json': { schema: spec.updateBody } } },
    },
    responses: { 200: { description: `${spec.noun} updated` } },
  });
}

for (const spec of Object.values(LEVELS)) registerDocs(spec);

type LevelUseCases = Parameters<typeof makeHierarchyController>[0];

function buildLevelRouter(spec: LevelSpec, useCases: LevelUseCases): Router {
  const router = Router();
  const controller = makeHierarchyController(useCases, spec.noun.charAt(0).toUpperCase() + spec.noun.slice(1));
  router.use(authenticate());
  // The Accountant (distributor form's pickers) and HR (employee Zone/HQ names) read the list; changing it is Admin's.
  router.get('/', requireRole('ADMIN', 'ACCOUNTANT', 'HR'), validate({ query: spec.listQuery }), controller.list);
  router.post('/', requireRole('ADMIN'), validate({ body: spec.createBody }), controller.create);
  router.patch('/:id', requireRole('ADMIN'), validate({ params: territoryIdParamsSchema, body: spec.updateBody }), controller.update);
  return router;
}

export function buildHierarchyRouter(useCases: {
  zones: { list: ListZonesUseCase; create: CreateZoneUseCase; update: UpdateZoneUseCase };
  hqs: { list: ListHqsUseCase; create: CreateHqUseCase; update: UpdateHqUseCase };
}): Router {
  const router = Router();
  router.use(`/${LEVELS.zones.segment}`, buildLevelRouter(LEVELS.zones, useCases.zones));
  router.use(`/${LEVELS.hqs.segment}`, buildLevelRouter(LEVELS.hqs, useCases.hqs));
  return router;
}

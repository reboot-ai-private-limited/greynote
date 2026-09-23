import { Router } from 'express';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { validate } from '@/shared/http/validate.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import type { CreatePayBandUseCase } from '../application/usecases/createPayBand.usecase.js';
import type { ListPayBandsUseCase } from '../application/usecases/listPayBands.usecase.js';
import type { UpdatePayBandUseCase } from '../application/usecases/updatePayBand.usecase.js';
import type { PayBand } from '../domain/payBand.entity.js';
import { makeMasterDataController } from './masterData.controller.js';
import {
  createPayBandBodySchema,
  masterDataIdParamsSchema,
  updatePayBandBodySchema,
} from './masterData.schemas.js';

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/identity/pay-bands',
  tags: ['Identity / Pay Bands'],
  summary: 'Admin: list pay bands',
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'Pay bands listed' } },
});
openApiRegistry.registerPath({
  method: 'post',
  path: '/api/identity/pay-bands',
  tags: ['Identity / Pay Bands'],
  summary: 'Admin: create a pay band',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: createPayBandBodySchema } } } },
  responses: { 201: { description: 'Pay band created' } },
});
openApiRegistry.registerPath({
  method: 'patch',
  path: '/api/identity/pay-bands/{id}',
  tags: ['Identity / Pay Bands'],
  summary: 'Admin: update a pay band',
  security: [{ bearerAuth: [] }],
  request: {
    params: masterDataIdParamsSchema,
    body: { content: { 'application/json': { schema: updatePayBandBodySchema } } },
  },
  responses: { 200: { description: 'Pay band updated' } },
});

export function buildPayBandsRouter(useCases: {
  list: ListPayBandsUseCase;
  create: CreatePayBandUseCase;
  update: UpdatePayBandUseCase;
}): Router {
  const router = Router();
  const controller = makeMasterDataController<PayBand, Omit<PayBand, 'id'>, Partial<Omit<PayBand, 'id'>>>(
    useCases,
    'Pay band',
  );

  router.get('/', authenticate(), requireRole('ADMIN'), controller.list);
  router.post(
    '/',
    authenticate(),
    requireRole('ADMIN'),
    validate({ body: createPayBandBodySchema }),
    controller.create,
  );
  router.patch(
    '/:id',
    authenticate(),
    requireRole('ADMIN'),
    validate({ params: masterDataIdParamsSchema, body: updatePayBandBodySchema }),
    controller.update,
  );

  return router;
}

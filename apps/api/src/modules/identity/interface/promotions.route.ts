import { Router } from 'express';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import { validate } from '@/shared/http/validate.middleware.js';
import type { makePromotionControllers } from './promotions.controller.js';
import { promotionBodySchema, promotionIdParamsSchema, promotionListQuerySchema, promotionUserParamsSchema } from './promotions.schemas.js';

const tags = ['Identity / Promotion'];
const security = [{ bearerAuth: [] }];
const body = { content: { 'application/json': { schema: promotionBodySchema } } };
openApiRegistry.registerPath({ method: 'post', path: '/api/identity/users/{id}/promotions/preview', tags, summary: 'Admin/HR: what a promotion would change, and what stops it', security, request: { params: promotionUserParamsSchema, body }, responses: { 200: { description: 'Preview' } } });
openApiRegistry.registerPath({ method: 'post', path: '/api/identity/users/{id}/promotions', tags, summary: 'Admin/HR: schedule a promotion for the 1st of a coming month (every direct report must be placed)', security, request: { params: promotionUserParamsSchema, body }, responses: { 201: { description: 'Scheduled' }, 400: { description: 'A problem the preview lists' } } });
openApiRegistry.registerPath({ method: 'get', path: '/api/identity/users/{id}/promotions', tags, summary: 'Admin/HR: an employee\'s promotions, newest first', security, request: { params: promotionUserParamsSchema }, responses: { 200: { description: 'Promotions' } } });

openApiRegistry.registerPath({ method: 'get', path: '/api/identity/promotions', tags, summary: 'Admin/HR: every promotion, newest first, with what needs attention', security, request: { query: promotionListQuerySchema }, responses: { 200: { description: 'Promotions' } } });
openApiRegistry.registerPath({ method: 'post', path: '/api/identity/promotions/{promotionId}/cancel', tags, summary: 'Admin/HR: cancel a promotion that has not applied', security, request: { params: promotionIdParamsSchema }, responses: { 200: { description: 'Cancelled' }, 409: { description: 'Not scheduled any more' } } });
openApiRegistry.registerPath({ method: 'post', path: '/api/identity/promotions/apply-due', tags, summary: 'Admin/HR: apply every promotion whose month has come (the server also does this hourly)', security, responses: { 200: { description: 'What the run did' } } });

/** Mounted at `/promotions`. */
export function buildPromotionsRouter(controllers: ReturnType<typeof makePromotionControllers>): Router {
  const router = Router();
  router.get('/', authenticate(), requireRole('ADMIN', 'HR'), validate({ query: promotionListQuerySchema }), controllers.listAll);
  router.post('/apply-due', authenticate(), requireRole('ADMIN', 'HR'), controllers.applyDue);
  router.post('/:promotionId/cancel', authenticate(), requireRole('ADMIN', 'HR'), validate({ params: promotionIdParamsSchema }), controllers.cancel);
  return router;
}

/** Mounted under `/users`, ahead of the users router, for `/users/:id/promotions`. */
export function buildUserPromotionsRouter(controllers: ReturnType<typeof makePromotionControllers>): Router {
  const router = Router();
  router.post('/:id/promotions/preview', authenticate(), requireRole('ADMIN', 'HR'), validate({ params: promotionUserParamsSchema, body: promotionBodySchema }), controllers.preview);
  router.post('/:id/promotions', authenticate(), requireRole('ADMIN', 'HR'), validate({ params: promotionUserParamsSchema, body: promotionBodySchema }), controllers.schedule);
  router.get('/:id/promotions', authenticate(), requireRole('ADMIN', 'HR'), validate({ params: promotionUserParamsSchema }), controllers.list);
  return router;
}

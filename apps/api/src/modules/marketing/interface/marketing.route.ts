import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import type { AnyZodObject, ZodTypeAny } from 'zod';
import { AppError } from '@/shared/errors/AppError.js';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import { validate } from '@/shared/http/validate.middleware.js';
import type { MarketingHandlers } from './marketing.controller.js';
import { createCampaignBodySchema, createVisualBodySchema, idParamsSchema, listCampaignsQuerySchema, listVisualsQuerySchema, setCampaignStatusBodySchema, setStatusBodySchema, setTargetBodySchema, listTargetsQuerySchema, targetQuerySchema, userIdParamsSchema } from './marketing.schemas.js';

const TAG = 'Marketing';
const MAX_VISUAL_BYTES = 25 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_VISUAL_BYTES } }).single('file');

/** Turns multer's error-first callback (a too-big or malformed file) into the same AppError path everything else uses. */
function uploadMiddleware(req: Request, res: Response, next: NextFunction): void {
  upload(req, res, (err: unknown) => (err ? next(AppError.badRequest(err instanceof Error ? err.message : 'Invalid file upload.')) : next()));
}

function doc(method: 'get' | 'post' | 'patch' | 'delete', path: string, summary: string, request: { query?: ZodTypeAny; body?: ZodTypeAny; params?: AnyZodObject } = {}): void {
  openApiRegistry.registerPath({
    method,
    path: `/api/marketing${path}`,
    tags: [TAG],
    summary,
    security: [{ bearerAuth: [] }],
    request: { ...(request.query && { query: request.query as AnyZodObject }), ...(request.params && { params: request.params }), ...(request.body && { body: { content: { 'application/json': { schema: request.body } } } }) },
    responses: { 200: { description: 'OK' } },
  });
}
doc('post', '/visuals', 'Admin: upload a Visual (multipart: file + title, category, optional productId) — image, PDF or MP4/MOV/WebM, up to 25 MB', { body: createVisualBodySchema });
doc('get', '/visuals', 'Visuals — field staff see the active ones; Admin all. General (no-product) ones are included', { query: listVisualsQuerySchema });
doc('patch', '/visuals/{id}', 'Admin: set a Visual active or inactive', { params: idParamsSchema, body: setStatusBodySchema });
doc('post', '/campaigns', 'Admin: create a company-wide Campaign', { body: createCampaignBodySchema });
doc('get', '/campaigns', 'Campaigns — field staff see the active ones; Admin all', { query: listCampaignsQuerySchema });
doc('patch', '/campaigns/{id}', 'Admin: set a Campaign active, inactive or completed', { params: idParamsSchema, body: setCampaignStatusBodySchema });
doc('post', '/targets', 'Admin, or a manager for themselves and their downline: set a Target over a run of whole months of the current financial year (replaces the same user + range + product + campaign)', { body: setTargetBodySchema });
doc('get', '/targets', 'An employee\'s targets touching a range of months, each with its share inside the range — self, the manager above, or Admin', { query: listTargetsQuerySchema });
doc('delete', '/targets/{id}', 'Admin, or a manager for their team: take a Target away (current financial year)', { params: idParamsSchema });
doc('get', '/targets/{userId}', 'Effective target (own + downline) and achieved for a month — self, the manager above, or Admin', { params: userIdParamsSchema, query: targetQuerySchema });

export function buildMarketingRouter(c: MarketingHandlers): Router {
  const router = Router();
  router.use(authenticate());
  router.post('/visuals', requireRole('ADMIN'), uploadMiddleware, validate({ body: createVisualBodySchema }), c.createVisual);
  router.get('/visuals', requireRole('FIELD', 'ADMIN'), validate({ query: listVisualsQuerySchema }), c.listVisuals);
  router.patch('/visuals/:id', requireRole('ADMIN'), validate({ params: idParamsSchema, body: setStatusBodySchema }), c.setVisualStatus);
  router.post('/campaigns', requireRole('ADMIN'), validate({ body: createCampaignBodySchema }), c.createCampaign);
  router.get('/campaigns', requireRole('FIELD', 'ADMIN'), validate({ query: listCampaignsQuerySchema }), c.listCampaigns);
  router.patch('/campaigns/:id', requireRole('ADMIN'), validate({ params: idParamsSchema, body: setCampaignStatusBodySchema }), c.setCampaignStatus);
  router.post('/targets', requireRole('FIELD', 'ADMIN'), validate({ body: setTargetBodySchema }), c.setTarget);
  router.get('/targets', requireRole('FIELD', 'ADMIN'), validate({ query: listTargetsQuerySchema }), c.listTargets);
  router.delete('/targets/:id', requireRole('FIELD', 'ADMIN'), validate({ params: idParamsSchema }), c.deleteTarget);
  router.get('/targets/:userId', requireRole('FIELD', 'ADMIN'), validate({ params: userIdParamsSchema, query: targetQuerySchema }), c.getTarget);
  return router;
}

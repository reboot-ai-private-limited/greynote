import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import type { AnyZodObject, ZodTypeAny } from 'zod';
import { AppError } from '@/shared/errors/AppError.js';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import { validate } from '@/shared/http/validate.middleware.js';
import type { MarketingHandlers } from './marketing.controller.js';
import { addDoctorVisualsBodySchema, createCampaignBodySchema, createVisualBodySchema, doctorIdParamsSchema, doctorVisualParamsSchema, idParamsSchema, updateVisualBodySchema, listCampaignsQuerySchema, listVisualsQuerySchema, setCampaignStatusBodySchema, setTargetBodySchema, listTargetsQuerySchema, targetQuerySchema, userIdParamsSchema } from './marketing.schemas.js';

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
doc('post', '/visuals', 'Admin: upload a Visual (multipart: file + title, category, optional productId) — image (PNG, JPG, WebP or GIF), up to 25 MB', { body: createVisualBodySchema });
doc('get', '/visuals', 'Visuals — field staff see the active ones; Admin all. General (no-product) ones are included', { query: listVisualsQuerySchema });
doc('patch', '/visuals/{id}', 'Admin: change a Visual\'s title, category or product, or set it active or inactive', { params: idParamsSchema, body: updateVisualBodySchema });
doc('post', '/visuals/{id}/file', 'Admin: put a new image on a Visual (multipart: file); the old file is removed from Cloudinary', { params: idParamsSchema });
doc('get', '/visuals/{id}/delete-impact', 'Admin: how many doctors have this Visual on their list', { params: idParamsSchema });
doc('delete', '/visuals/{id}', 'Admin: delete a Visual for good, with every doctor\'s pick of it and its file in Cloudinary', { params: idParamsSchema });
doc('get', '/doctors/{doctorId}/visuals', 'The visuals picked for a doctor — the doctor\'s MR, a manager above them, or Admin', { params: doctorIdParamsSchema });
doc('post', '/doctors/{doctorId}/visuals', 'Add visuals to a doctor\'s list (add-only) — the doctor\'s MR, a manager above them, or Admin', { params: doctorIdParamsSchema, body: addDoctorVisualsBodySchema });
doc('delete', '/doctors/{doctorId}/visuals/{visualId}', 'Take a visual off a doctor\'s list — a manager above the doctor\'s MR, or Admin (not the MR)', { params: doctorVisualParamsSchema });
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
  router.patch('/visuals/:id', requireRole('ADMIN'), validate({ params: idParamsSchema, body: updateVisualBodySchema }), c.updateVisual);
  router.post('/visuals/:id/file', requireRole('ADMIN'), uploadMiddleware, validate({ params: idParamsSchema }), c.replaceVisualFile);
  router.get('/visuals/:id/delete-impact', requireRole('ADMIN'), validate({ params: idParamsSchema }), c.visualDeleteImpact);
  router.delete('/visuals/:id', requireRole('ADMIN'), validate({ params: idParamsSchema }), c.deleteVisual);
  router.get('/doctors/:doctorId/visuals', requireRole('FIELD', 'ADMIN'), validate({ params: doctorIdParamsSchema }), c.listDoctorVisuals);
  router.post('/doctors/:doctorId/visuals', requireRole('FIELD', 'ADMIN'), validate({ params: doctorIdParamsSchema, body: addDoctorVisualsBodySchema }), c.addDoctorVisuals);
  router.delete('/doctors/:doctorId/visuals/:visualId', requireRole('FIELD', 'ADMIN'), validate({ params: doctorVisualParamsSchema }), c.removeDoctorVisual);
  router.post('/campaigns', requireRole('ADMIN'), validate({ body: createCampaignBodySchema }), c.createCampaign);
  router.get('/campaigns', requireRole('FIELD', 'ADMIN'), validate({ query: listCampaignsQuerySchema }), c.listCampaigns);
  router.patch('/campaigns/:id', requireRole('ADMIN'), validate({ params: idParamsSchema, body: setCampaignStatusBodySchema }), c.setCampaignStatus);
  router.post('/targets', requireRole('FIELD', 'ADMIN'), validate({ body: setTargetBodySchema }), c.setTarget);
  router.get('/targets', requireRole('FIELD', 'ADMIN'), validate({ query: listTargetsQuerySchema }), c.listTargets);
  router.delete('/targets/:id', requireRole('FIELD', 'ADMIN'), validate({ params: idParamsSchema }), c.deleteTarget);
  router.get('/targets/:userId', requireRole('FIELD', 'ADMIN'), validate({ params: userIdParamsSchema, query: targetQuerySchema }), c.getTarget);
  return router;
}

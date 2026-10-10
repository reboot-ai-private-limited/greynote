import type { Request, RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '@/shared/errors/AppError.js';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { requiredParam } from '@/shared/http/params.util.js';
import { sendSuccess } from '@/shared/http/response.util.js';
import { MarketingRefusal } from '../domain/marketingRefusal.js';
import type { DeleteTargetUseCase, GetTargetSummaryUseCase, ListTargetsUseCase, SetTargetUseCase } from '../application/usecases/targets.usecase.js';
import type { AddDoctorVisualsUseCase, ListDoctorVisualsUseCase, RemoveDoctorVisualUseCase } from '../application/usecases/doctorVisuals.usecase.js';
import type { Actor, CreateCampaignUseCase, CreateVisualUseCase, ListCampaignsUseCase, ListVisualsUseCase, SetCampaignStatusUseCase, UpdateVisualUseCase } from '../application/usecases/visualsAndCampaigns.usecase.js';
import type { addDoctorVisualsBodySchema, createCampaignBodySchema, createVisualBodySchema, listCampaignsQuerySchema, listVisualsQuerySchema, setCampaignStatusBodySchema, updateVisualBodySchema, setTargetBodySchema, listTargetsQuerySchema, targetQuerySchema } from './marketing.schemas.js';

function actorOf(req: Request): Actor {
  if (!req.user) throw AppError.unauthenticated();
  return { id: req.user.sub, role: req.user.role };
}

/** A refusal keeps its own code in the details, so a client can tell them apart without parsing text. */
async function refusing<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (!(err instanceof MarketingRefusal)) throw err;
    if (err.status === 403) throw AppError.forbidden(err.message);
    if (err.status === 404) throw AppError.notFound(err.message);
    throw AppError.badRequest(err.message, { code: err.code });
  }
}

export type MarketingHandlers = Record<'createVisual' | 'listVisuals' | 'updateVisual' | 'listDoctorVisuals' | 'addDoctorVisuals' | 'removeDoctorVisual' | 'createCampaign' | 'listCampaigns' | 'setCampaignStatus' | 'setTarget' | 'deleteTarget' | 'listTargets' | 'getTarget', RequestHandler>;

export function makeMarketingControllers(u: {
  createVisual: CreateVisualUseCase;
  listVisuals: ListVisualsUseCase;
  updateVisual: UpdateVisualUseCase;
  listDoctorVisuals: ListDoctorVisualsUseCase;
  addDoctorVisuals: AddDoctorVisualsUseCase;
  removeDoctorVisual: RemoveDoctorVisualUseCase;
  createCampaign: CreateCampaignUseCase;
  listCampaigns: ListCampaignsUseCase;
  setCampaignStatus: SetCampaignStatusUseCase;
  setTarget: SetTargetUseCase;
  deleteTarget: DeleteTargetUseCase;
  listTargets: ListTargetsUseCase;
  getTarget: GetTargetSummaryUseCase;
}): MarketingHandlers {
  return {
    createVisual: asyncHandler(async (req, res) => {
      const b = req.body as z.output<typeof createVisualBodySchema>;
      if (!req.file) throw AppError.badRequest('Attach the file as the "file" field.', { field: 'file' });
      const visual = await refusing(() => u.createVisual.execute(actorOf(req), { productId: b.productId ?? null, title: b.title, category: b.category, file: { buffer: req.file!.buffer, mimeType: req.file!.mimetype } }));
      sendSuccess(req, res, visual, 'The visual was uploaded.', 201);
    }),
    listVisuals: asyncHandler(async (req, res) => sendSuccess(req, res, await u.listVisuals.execute(actorOf(req), req.query as z.output<typeof listVisualsQuerySchema>), 'Visuals.', 200)),
    updateVisual: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await refusing(() => u.updateVisual.execute(requiredParam(req.params, 'id'), req.body as z.output<typeof updateVisualBodySchema>)), 'The visual was updated.', 200),
    ),
    listDoctorVisuals: asyncHandler(async (req, res) => sendSuccess(req, res, await refusing(() => u.listDoctorVisuals.execute(actorOf(req), requiredParam(req.params, 'doctorId'))), 'The doctor’s visuals.', 200)),
    addDoctorVisuals: asyncHandler(async (req, res) => {
      await refusing(() => u.addDoctorVisuals.execute(actorOf(req), requiredParam(req.params, 'doctorId'), (req.body as z.output<typeof addDoctorVisualsBodySchema>).visualIds));
      sendSuccess(req, res, await refusing(() => u.listDoctorVisuals.execute(actorOf(req), requiredParam(req.params, 'doctorId'))), 'The visuals were added to the doctor.', 200);
    }),
    removeDoctorVisual: asyncHandler(async (req, res) => {
      await refusing(() => u.removeDoctorVisual.execute(actorOf(req), requiredParam(req.params, 'doctorId'), requiredParam(req.params, 'visualId')));
      sendSuccess(req, res, null, 'The visual was taken off the doctor.', 200);
    }),
    createCampaign: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await refusing(() => u.createCampaign.execute(actorOf(req), req.body as z.output<typeof createCampaignBodySchema>)), 'The campaign was created.', 201),
    ),
    listCampaigns: asyncHandler(async (req, res) => sendSuccess(req, res, await u.listCampaigns.execute(actorOf(req), req.query as z.output<typeof listCampaignsQuerySchema>), 'Campaigns.', 200)),
    setCampaignStatus: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await refusing(() => u.setCampaignStatus.execute(requiredParam(req.params, 'id'), (req.body as z.output<typeof setCampaignStatusBodySchema>).status)), 'The campaign was updated.', 200),
    ),
    setTarget: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await refusing(() => u.setTarget.execute(actorOf(req), req.body as z.output<typeof setTargetBodySchema>)), 'The target was saved.', 200),
    ),
    deleteTarget: asyncHandler(async (req, res) => {
      await refusing(() => u.deleteTarget.execute(actorOf(req), requiredParam(req.params, 'id')));
      sendSuccess(req, res, null, 'The target was removed.', 200);
    }),
    listTargets: asyncHandler(async (req, res) => {
      const q = req.query as unknown as z.output<typeof listTargetsQuerySchema>;
      sendSuccess(req, res, await refusing(() => u.listTargets.execute(actorOf(req), { userId: q.userId, fromMonth: q.from, toMonth: q.to })), 'Targets.', 200);
    }),
    getTarget: asyncHandler(async (req, res) => {
      const q = req.query as unknown as z.output<typeof targetQuerySchema>;
      const summary = await refusing(() => u.getTarget.execute(actorOf(req), requiredParam(req.params, 'userId'), { month: q.month, productId: q.productId ?? null, campaignId: q.campaignId ?? null }));
      sendSuccess(req, res, summary, 'Target and achievement.', 200);
    }),
  };
}

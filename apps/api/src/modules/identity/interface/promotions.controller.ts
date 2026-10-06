import type { PromotionStatus } from '@greynote/contracts';
import type { Request, RequestHandler } from 'express';
import { AppError } from '@/shared/errors/AppError.js';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { requiredParam } from '@/shared/http/params.util.js';
import { sendSuccess } from '@/shared/http/response.util.js';
import type { ApplyDuePromotionsUseCase } from '../application/usecases/applyDuePromotions.usecase.js';
import type { CancelPromotionUseCase, ListAllPromotionsUseCase, ListPromotionsUseCase, PreviewPromotionUseCase, SchedulePromotionUseCase } from '../application/usecases/promotions.usecase.js';

const callerId = (req: Request): string => {
  if (!req.user) throw AppError.unauthenticated();
  return req.user.sub;
};

export function makePromotionControllers(useCases: {
  preview: PreviewPromotionUseCase;
  schedule: SchedulePromotionUseCase;
  list: ListPromotionsUseCase;
  listAll: ListAllPromotionsUseCase;
  cancel: CancelPromotionUseCase;
  applyDue: ApplyDuePromotionsUseCase;
}): Record<'preview' | 'schedule' | 'list' | 'listAll' | 'cancel' | 'applyDue', RequestHandler> {
  return {
    preview: asyncHandler(async (req, res) => {
      sendSuccess(req, res, await useCases.preview.execute(requiredParam(req.params, 'id'), req.body), 'Promotion previewed.', 200);
    }),
    schedule: asyncHandler(async (req, res) => {
      sendSuccess(req, res, await useCases.schedule.execute(requiredParam(req.params, 'id'), req.body, callerId(req)), 'Promotion scheduled.', 201);
    }),
    list: asyncHandler(async (req, res) => {
      sendSuccess(req, res, await useCases.list.execute(requiredParam(req.params, 'id')), 'Promotions listed.', 200);
    }),
    listAll: asyncHandler(async (req, res) => {
      sendSuccess(req, res, await useCases.listAll.execute(req.query['status'] as PromotionStatus | undefined), 'Promotions listed.', 200);
    }),
    cancel: asyncHandler(async (req, res) => {
      sendSuccess(req, res, await useCases.cancel.execute(requiredParam(req.params, 'promotionId')), 'Promotion cancelled.', 200);
    }),
    applyDue: asyncHandler(async (req, res) => {
      sendSuccess(req, res, await useCases.applyDue.execute(), 'Due promotions applied.', 200);
    }),
  };
}

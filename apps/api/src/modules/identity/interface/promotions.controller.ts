import type { Request, RequestHandler } from 'express';
import { AppError } from '@/shared/errors/AppError.js';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { requiredParam } from '@/shared/http/params.util.js';
import { sendSuccess } from '@/shared/http/response.util.js';
import type { ListPromotionsUseCase, PreviewPromotionUseCase, SchedulePromotionUseCase } from '../application/usecases/promotions.usecase.js';

const callerId = (req: Request): string => {
  if (!req.user) throw AppError.unauthenticated();
  return req.user.sub;
};

export function makePromotionControllers(useCases: {
  preview: PreviewPromotionUseCase;
  schedule: SchedulePromotionUseCase;
  list: ListPromotionsUseCase;
}): Record<'preview' | 'schedule' | 'list', RequestHandler> {
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
  };
}

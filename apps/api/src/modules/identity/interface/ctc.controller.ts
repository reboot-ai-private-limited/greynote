import type { Request, RequestHandler } from 'express';
import { AppError } from '@/shared/errors/AppError.js';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { requiredParam } from '@/shared/http/params.util.js';
import { sendSuccess } from '@/shared/http/response.util.js';
import type { AssignCtcUseCase } from '../application/usecases/assignCtc.usecase.js';
import type { ListCtcHistoryUseCase } from '../application/usecases/listCtcHistory.usecase.js';
import type { PreviewCtcUseCase } from '../application/usecases/previewCtc.usecase.js';
import type { ReapplyCtcUseCase } from '../application/usecases/reapplyCtc.usecase.js';

const callerId = (req: Request): string => {
  if (!req.user) throw AppError.unauthenticated();
  return req.user.sub;
};

export function makeCtcControllers(useCases: {
  preview: PreviewCtcUseCase;
  assign: AssignCtcUseCase;
  history: ListCtcHistoryUseCase;
  reapply: ReapplyCtcUseCase;
}): Record<'preview' | 'assign' | 'history' | 'reapply', RequestHandler> {
  return {
    preview: asyncHandler(async (req, res) => {
      sendSuccess(req, res, await useCases.preview.execute(req.body.ctcAnnualPaise, req.body.overrides), 'CTC breakdown computed.', 200);
    }),
    assign: asyncHandler(async (req, res) => {
      sendSuccess(req, res, await useCases.assign.execute(requiredParam(req.params, 'id'), req.body, callerId(req)), 'CTC saved.', 201);
    }),
    history: asyncHandler(async (req, res) => {
      sendSuccess(req, res, await useCases.history.execute(requiredParam(req.params, 'id')), 'CTC history listed.', 200);
    }),
    reapply: asyncHandler(async (req, res) => {
      sendSuccess(req, res, await useCases.reapply.execute(req.body, callerId(req)), 'Formula re-applied.', 200);
    }),
  };
}

import type { RequestHandler } from 'express';
import { AppError } from '@/shared/errors/AppError.js';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { requiredParam } from '@/shared/http/params.util.js';
import { sendSuccess } from '@/shared/http/response.util.js';
import type {
  CreateEmployeeDraftUseCase,
  DeleteEmployeeDraftUseCase,
  GetEmployeeDraftUseCase,
  ListEmployeeDraftsUseCase,
  UpdateEmployeeDraftUseCase,
} from '../application/usecases/employeeDrafts.usecase.js';
import type { FinalizeEmployeeDraftUseCase } from '../application/usecases/finalizeEmployeeDraft.usecase.js';

export function makeEmployeeDraftControllers(useCases: {
  create: CreateEmployeeDraftUseCase;
  list: ListEmployeeDraftsUseCase;
  get: GetEmployeeDraftUseCase;
  update: UpdateEmployeeDraftUseCase;
  remove: DeleteEmployeeDraftUseCase;
  finalize: FinalizeEmployeeDraftUseCase;
}): Record<'create' | 'list' | 'get' | 'update' | 'remove' | 'finalize', RequestHandler> {
  const create: RequestHandler = asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthenticated();
    sendSuccess(req, res, await useCases.create.execute(req.user.sub, req.body), 'Draft saved.', 201);
  });
  const list: RequestHandler = asyncHandler(async (req, res) => {
    sendSuccess(req, res, await useCases.list.execute(), 'Drafts listed.', 200);
  });
  const get: RequestHandler = asyncHandler(async (req, res) => {
    sendSuccess(req, res, await useCases.get.execute(requiredParam(req.params, 'id')), 'Draft fetched.', 200);
  });
  const update: RequestHandler = asyncHandler(async (req, res) => {
    sendSuccess(req, res, await useCases.update.execute(requiredParam(req.params, 'id'), req.body), 'Draft saved.', 200);
  });
  const remove: RequestHandler = asyncHandler(async (req, res) => {
    await useCases.remove.execute(requiredParam(req.params, 'id'));
    sendSuccess(req, res, {}, 'Draft deleted.', 200);
  });
  const finalize: RequestHandler = asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthenticated();
    const result = await useCases.finalize.execute(
      { id: req.user.sub, role: req.user.role },
      requiredParam(req.params, 'id'),
    );
    sendSuccess(req, res, result, 'Employee created.', 201);
  });
  return { create, list, get, update, remove, finalize };
}

import type { RequestHandler } from 'express';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { AppError } from '@/shared/errors/AppError.js';
import { requiredParam } from '@/shared/http/params.util.js';
import { sendSuccess } from '@/shared/http/response.util.js';
import type { UpdateConfigValueUseCase } from '../application/usecases/updateConfigValue.usecase.js';

export function makeUpdateConfigController(useCase: UpdateConfigValueUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthenticated();
    const result = await useCase.execute(
      req.user.sub,
      req.user.role,
      requiredParam(req.params, 'key'),
      req.body.value,
    );
    sendSuccess(req, res, result, 'Config updated.', 200);
  });
}

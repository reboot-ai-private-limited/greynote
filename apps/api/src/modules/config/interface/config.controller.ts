import type { RequestHandler } from 'express';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { AppError } from '@/shared/errors/AppError.js';
import { requiredParam } from '@/shared/http/params.util.js';
import { sendSuccess } from '@/shared/http/response.util.js';
import type { GetPublicConfigUseCase } from '../application/usecases/getPublicConfig.usecase.js';
import type { ListConfigUseCase } from '../application/usecases/listConfig.usecase.js';
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

export function makeListConfigController(useCase: ListConfigUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthenticated();
    sendSuccess(req, res, await useCase.execute(req.user.role), 'System settings.', 200);
  });
}

export function makePublicConfigController(useCase: GetPublicConfigUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    sendSuccess(req, res, await useCase.execute(), 'Public settings.', 200);
  });
}

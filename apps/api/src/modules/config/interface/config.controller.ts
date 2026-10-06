import type { RequestHandler } from 'express';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { AppError } from '@/shared/errors/AppError.js';
import { requiredParam } from '@/shared/http/params.util.js';
import { sendSuccess } from '@/shared/http/response.util.js';
import type { FinancialYearClose } from '../application/usecases/financialYearClose.usecase.js';
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

export function makeFinancialYearControllers(useCase: FinancialYearClose): Record<'state' | 'close' | 'reopen', RequestHandler> {
  const user = (req: Parameters<RequestHandler>[0]) => {
    if (!req.user) throw AppError.unauthenticated();
    return req.user;
  };
  return {
    state: asyncHandler(async (req, res) => sendSuccess(req, res, await useCase.state(user(req).role), 'Financial years.', 200)),
    close: asyncHandler(async (req, res) => sendSuccess(req, res, await useCase.close(user(req).sub, user(req).role, req.body.year), 'The financial year was closed.', 200)),
    reopen: asyncHandler(async (req, res) => sendSuccess(req, res, await useCase.reopen(user(req).sub, user(req).role, req.body.year), 'The financial year was reopened.', 200)),
  };
}

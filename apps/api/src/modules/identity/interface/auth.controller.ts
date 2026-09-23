import type { RequestHandler } from 'express';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { sendSuccess } from '@/shared/http/response.util.js';
import type { LoginUseCase } from '../application/usecases/login.usecase.js';
import type { RefreshSessionUseCase } from '../application/usecases/refreshSession.usecase.js';
import type { LogoutUseCase } from '../application/usecases/logout.usecase.js';
import type { LogoutAllSessionsUseCase } from '../application/usecases/logoutAllSessions.usecase.js';
import { AppError } from '@/shared/errors/AppError.js';

export function makeLoginController(useCase: LoginUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    const result = await useCase.execute(req.body);
    sendSuccess(req, res, result, 'Logged in.', 200);
  });
}

export function makeRefreshController(useCase: RefreshSessionUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    const result = await useCase.execute(req.body.refreshToken);
    sendSuccess(req, res, result, 'Session refreshed.', 200);
  });
}

export function makeLogoutController(useCase: LogoutUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthenticated();
    await useCase.execute(req.user.sub, req.body.refreshToken);
    sendSuccess(req, res, {}, 'Logged out.', 200);
  });
}

export function makeLogoutAllController(useCase: LogoutAllSessionsUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    await useCase.execute(req.body.userId);
    sendSuccess(req, res, {}, 'All sessions revoked.', 200);
  });
}

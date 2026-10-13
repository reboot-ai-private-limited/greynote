import type { RequestHandler } from 'express';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { sendSuccess } from '@/shared/http/response.util.js';
import type { LoginUseCase } from '../application/usecases/login.usecase.js';
import type { RefreshSessionUseCase } from '../application/usecases/refreshSession.usecase.js';
import type { LogoutUseCase } from '../application/usecases/logout.usecase.js';
import type { LogoutAllSessionsUseCase } from '../application/usecases/logoutAllSessions.usecase.js';
import type { DeleteAccountUseCase } from '../application/usecases/deleteAccount.usecase.js';
import { AppError } from '@/shared/errors/AppError.js';
import type { GetUserSummaryUseCase } from '../application/usecases/getUserSummary.usecase.js';
import { clearRefreshCookie, deliverRefreshToken, isWebClient, readRefreshToken } from './refreshCookie.js';

export function makeLoginController(useCase: LoginUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    const result = await useCase.execute(req.body, { viaWeb: isWebClient(req) });
    sendSuccess(req, res, deliverRefreshToken(req, res, result), 'Logged in.', 200);
  });
}

export function makeRefreshController(useCase: RefreshSessionUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    const refreshToken = readRefreshToken(req);
    if (!refreshToken) throw AppError.unauthenticated();
    const result = await useCase.execute(refreshToken);
    sendSuccess(req, res, deliverRefreshToken(req, res, result), 'Session refreshed.', 200);
  });
}

export function makeLogoutController(useCase: LogoutUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthenticated();
    const refreshToken = readRefreshToken(req);
    if (refreshToken) await useCase.execute(req.user.sub, refreshToken);
    clearRefreshCookie(res);
    sendSuccess(req, res, {}, 'Logged out.', 200);
  });
}

export function makeLogoutAllController(useCase: LogoutAllSessionsUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    await useCase.execute(req.body.userId);
    sendSuccess(req, res, {}, 'All sessions revoked.', 200);
  });
}

export function makeMeController(useCase: GetUserSummaryUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthenticated();
    sendSuccess(req, res, await useCase.execute(req.user.sub), 'OK', 200);
  });
}

export function makeDeleteAccountController(useCase: DeleteAccountUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthenticated();
    await useCase.deleteOwn(req.user.sub, req.body.password);
    clearRefreshCookie(res);
    sendSuccess(req, res, {}, 'Your account has been deleted.', 200);
  });
}

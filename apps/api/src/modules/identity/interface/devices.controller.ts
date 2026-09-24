import type { RequestHandler } from 'express';
import { AppError } from '@/shared/errors/AppError.js';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { requiredParam } from '@/shared/http/params.util.js';
import { sendSuccess } from '@/shared/http/response.util.js';
import type { ApproveDeviceUseCase } from '../application/usecases/approveDevice.usecase.js';
import type { ListPendingDevicesUseCase } from '../application/usecases/listPendingDevices.usecase.js';
import type { ListUserDevicesUseCase } from '../application/usecases/listUserDevices.usecase.js';
import type { LogoutDeviceUseCase } from '../application/usecases/logoutDevice.usecase.js';
import type { RejectDeviceUseCase } from '../application/usecases/rejectDevice.usecase.js';
import type { RemoveDeviceUseCase } from '../application/usecases/removeDevice.usecase.js';

export function makeListPendingDevicesController(useCase: ListPendingDevicesUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    sendSuccess(req, res, await useCase.execute(), 'Pending device requests listed.', 200);
  });
}

export function makeListUserDevicesController(useCase: ListUserDevicesUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    sendSuccess(req, res, await useCase.execute(requiredParam(req.params, 'id')), 'Devices listed.', 200);
  });
}

export function makeApproveDeviceController(useCase: ApproveDeviceUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthenticated();
    const device = await useCase.execute(
      req.user.sub,
      requiredParam(req.params, 'id'),
      requiredParam(req.params, 'deviceRowId'),
    );
    sendSuccess(req, res, device, 'Device approved.', 200);
  });
}

export function makeRejectDeviceController(useCase: RejectDeviceUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthenticated();
    const device = await useCase.execute(
      req.user.sub,
      requiredParam(req.params, 'id'),
      requiredParam(req.params, 'deviceRowId'),
    );
    sendSuccess(req, res, device, 'Device rejected.', 200);
  });
}

export function makeRemoveDeviceController(useCase: RemoveDeviceUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthenticated();
    await useCase.execute(req.user.sub, requiredParam(req.params, 'id'), requiredParam(req.params, 'deviceRowId'));
    sendSuccess(req, res, {}, 'Device removed.', 200);
  });
}

export function makeLogoutDeviceController(useCase: LogoutDeviceUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    await useCase.execute(requiredParam(req.params, 'id'), requiredParam(req.params, 'deviceRowId'));
    sendSuccess(req, res, {}, 'Device logged out.', 200);
  });
}

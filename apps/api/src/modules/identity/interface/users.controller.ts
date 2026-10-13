import type { RequestHandler } from 'express';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { AppError } from '@/shared/errors/AppError.js';
import { requiredParam } from '@/shared/http/params.util.js';
import { sendSuccess } from '@/shared/http/response.util.js';
import type { PaginationQuery } from '@/shared/http/pagination.js';
import type { ListUsersUseCase } from '../application/usecases/listUsers.usecase.js';
import type { GetUserDetailUseCase } from '../application/usecases/getUserDetail.usecase.js';
import type { CreateUserUseCase } from '../application/usecases/createUser.usecase.js';
import type { UpdateUserUseCase } from '../application/usecases/updateUser.usecase.js';
import type { UploadUserDocumentUseCase } from '../application/usecases/uploadUserDocument.usecase.js';
import type { RemoveUserDocumentUseCase } from '../application/usecases/removeUserDocument.usecase.js';
import type { RemoveEmployeePhotoUseCase, SetEmployeePhotoUseCase } from '../application/usecases/employeePhoto.usecase.js';
import type { DeleteAccountUseCase } from '../application/usecases/deleteAccount.usecase.js';
import type { ResetPasswordUseCase } from '../application/usecases/resetPassword.usecase.js';
import type { UnblockUserUseCase } from '../application/usecases/unblockUser.usecase.js';
import type { UserListFilters } from '../domain/user.repository.port.js';

export function makeListUsersController(useCase: ListUsersUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    const query = req.query as unknown as PaginationQuery & UserListFilters;
    const filters: UserListFilters = {
      ...(query.role !== undefined && { role: query.role }),
      ...(query.designationId !== undefined && { designationId: query.designationId }),
      ...(query.managerId !== undefined && { managerId: query.managerId }),
      ...(query.status !== undefined && { status: query.status }),
      ...(query.isBlocked !== undefined && { isBlocked: query.isBlocked }),
      ...(query.search !== undefined && { search: query.search }),
    };
    const result = await useCase.execute(query, filters);
    sendSuccess(req, res, result, 'Users listed.', 200);
  });
}

export function makeGetUserDetailController(useCase: GetUserDetailUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    const result = await useCase.execute(requiredParam(req.params, 'id'));
    sendSuccess(req, res, result, 'User detail fetched.', 200);
  });
}

export function makeCreateUserController(useCase: CreateUserUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthenticated();
    const result = await useCase.execute(req.user.role, req.body);
    sendSuccess(req, res, result, 'User created.', 201);
  });
}

export function makeUpdateUserController(useCase: UpdateUserUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    const result = await useCase.execute(requiredParam(req.params, 'id'), req.body);
    sendSuccess(req, res, result, 'User updated.', 200);
  });
}

export function makeUploadUserDocumentController(useCase: UploadUserDocumentUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    if (!req.file) throw AppError.badRequest('A file is required.', { field: 'file' });
    const document = await useCase.execute(
      requiredParam(req.params, 'id'),
      req.body.documentType,
      req.file.buffer,
      req.file.mimetype,
    );
    sendSuccess(req, res, document, 'Document uploaded.', 201);
  });
}

export function makeRemoveUserDocumentController(useCase: RemoveUserDocumentUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    await useCase.execute(requiredParam(req.params, 'id'), requiredParam(req.params, 'documentId'));
    sendSuccess(req, res, {}, 'Document removed.', 200);
  });
}

export function makeUnblockUserController(useCase: UnblockUserUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthenticated();
    await useCase.execute(req.user.sub, req.user.role, requiredParam(req.params, 'id'), (req.body as { reason: string }).reason);
    sendSuccess(req, res, {}, 'User unblocked.', 200);
  });
}

export function makeResetPasswordController(useCase: ResetPasswordUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    await useCase.execute(requiredParam(req.params, 'id'), req.body.newPassword);
    sendSuccess(req, res, {}, 'Password reset. The user has been logged out everywhere.', 200);
  });
}

export function makeAnonymiseUserController(useCase: DeleteAccountUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    await useCase.anonymise(requiredParam(req.params, 'id'));
    sendSuccess(req, res, {}, 'Account deleted. Personal data removed; records kept.', 200);
  });
}

export function makeSetEmployeePhotoController(useCase: SetEmployeePhotoUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    if (!req.file) throw AppError.badRequest('A file is required.', { field: 'file' });
    sendSuccess(req, res, await useCase.execute(requiredParam(req.params, 'id'), req.file.buffer), 'Photo saved.', 200);
  });
}

export function makeRemoveEmployeePhotoController(useCase: RemoveEmployeePhotoUseCase): RequestHandler {
  return asyncHandler(async (req, res) => {
    sendSuccess(req, res, await useCase.execute(requiredParam(req.params, 'id')), 'Photo removed.', 200);
  });
}

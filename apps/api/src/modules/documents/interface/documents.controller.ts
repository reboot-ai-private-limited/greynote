import type { Request, RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '@/shared/errors/AppError.js';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { requiredParam } from '@/shared/http/params.util.js';
import { sendSuccess } from '@/shared/http/response.util.js';
import { toDocumentDto, type DeleteDocumentUseCase, type ListDocumentsUseCase, type UploadDocumentUseCase } from '../application/usecases/documents.usecase.js';
import type { uploadBodySchema } from './documents.schemas.js';

const actorOf = (req: Request): { id: string; role: string } => {
  if (!req.user) throw AppError.unauthenticated();
  return { id: req.user.sub, role: req.user.role };
};

export type DocumentsHandlers = Record<'upload' | 'list' | 'remove', RequestHandler>;

export function makeDocumentsControllers(u: { upload: UploadDocumentUseCase; list: ListDocumentsUseCase; remove: DeleteDocumentUseCase }): DocumentsHandlers {
  return {
    upload: asyncHandler(async (req, res) => {
      if (!req.file) throw AppError.badRequest('A file is required.', { field: 'file' });
      const b = req.body as z.output<typeof uploadBodySchema>;
      const doc = await u.upload.execute(actorOf(req).id, { title: b.title, category: b.category, userIds: b.userIds, file: req.file.buffer });
      sendSuccess(req, res, toDocumentDto(doc, true), 'Document added.', 201);
    }),
    list: asyncHandler(async (req, res) => sendSuccess(req, res, await u.list.execute(actorOf(req)), 'Documents.', 200)),
    remove: asyncHandler(async (req, res) => {
      await u.remove.execute(requiredParam(req.params, 'id'));
      sendSuccess(req, res, null, 'Document removed.', 200);
    }),
  };
}

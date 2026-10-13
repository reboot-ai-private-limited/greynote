import multer from 'multer';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '@/shared/errors/AppError.js';

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PHOTO_BYTES } }).single('file');

/** One photo in the `file` field, held in memory; a too-big or odd upload becomes the usual bad-request error. */
export function photoUpload(req: Request, res: Response, next: NextFunction): void {
  upload(req, res, (err: unknown) => {
    if (err) {
      const big = (err as { code?: string }).code === 'LIMIT_FILE_SIZE';
      next(AppError.badRequest(big ? 'The photo is too big. Keep it under 5 MB.' : 'Invalid photo upload.', { field: 'file' }));
      return;
    }
    next();
  });
}

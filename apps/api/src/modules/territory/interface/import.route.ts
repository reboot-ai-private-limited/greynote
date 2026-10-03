import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { AppError } from '@/shared/errors/AppError.js';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { sendSuccess } from '@/shared/http/response.util.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import { validate } from '@/shared/http/validate.middleware.js';
import type { ImportHierarchyUseCase } from '../application/usecases/importHierarchy.usecase.js';
import { MAX_IMPORT_ROWS, readHierarchyCsv } from './hierarchyImport.csv.js';

const MAX_IMPORT_BYTES = 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMPORT_BYTES } }).single('file');

/** Same multer → AppError bridge as identity's document upload. */
function uploadMiddleware(req: Request, res: Response, next: NextFunction): void {
  upload(req, res, (err: unknown) => {
    if (err) {
      next(AppError.badRequest(err instanceof Error ? err.message : 'Invalid file upload.'));
      return;
    }
    next();
  });
}

// `z.coerce.boolean()` would turn the string "false" into true.
const importQuerySchema = z.object({
  dryRun: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/api/territory/import',
  tags: ['Territory / Import'],
  summary: 'Admin: bulk-create Zones / HQs from a CSV',
  description:
    'multipart/form-data with a `file` field (CSV, ≤1 MB, ≤' +
    `${MAX_IMPORT_ROWS} rows). Columns: zone (required), hq. ` +
    'An imported HQ has no base place yet; set it in the app before adding Routes. ' +
    'Existing names (ignoring case) are reused, never changed. Any problem rejects the whole file with every problem listed by line. ' +
    '`?dryRun=true` reports what would be created without writing.',
  security: [{ bearerAuth: [] }],
  request: {
    query: importQuerySchema,
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({ file: z.string().openapi({ type: 'string', format: 'binary' }) }),
        },
      },
    },
  },
  responses: {
    200: { description: 'Dry run: what would be created' },
    201: { description: 'Imported' },
    400: { description: 'Problems found (publicDetails.errors lists each with its line); nothing written' },
  },
});

export function buildImportRouter(useCase: ImportHierarchyUseCase): Router {
  const router = Router();
  router.post(
    '/',
    authenticate(),
    requireRole('ADMIN'),
    validate({ query: importQuerySchema }),
    uploadMiddleware,
    asyncHandler(async (req, res) => {
      if (!req.file) throw AppError.badRequest('A CSV file is required.', { field: 'file' });
      const { rows, errors } = readHierarchyCsv(req.file.buffer.toString('utf8'));
      if (errors.length > 0) {
        throw AppError.badRequest(`The file has ${errors.length} problem(s); nothing was imported.`, { errors });
      }

      const { dryRun } = req.query as unknown as z.infer<typeof importQuerySchema>;
      const result = await useCase.execute(rows, { dryRun });
      sendSuccess(
        req,
        res,
        result,
        dryRun ? 'Dry run: nothing was written.' : 'Import complete.',
        dryRun ? 200 : 201,
      );
    }),
  );
  return router;
}

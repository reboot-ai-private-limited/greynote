import { AppError } from '@/shared/errors/AppError.js';
import { cloudinaryClient } from '@/shared/storage/cloudinary.js';
import type { DocumentStoragePort, DocumentStorageUploadMeta } from '../domain/documentStorage.port.js';

export class CloudinaryDocumentStorage implements DocumentStoragePort {
  upload(fileBuffer: Buffer, meta: DocumentStorageUploadMeta): Promise<{ url: string; publicId: string }> {
    const cloudinary = cloudinaryClient();
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: `greynote/users/${meta.userId}/documents`, resource_type: 'auto' },
        (error, result) => {
          // Cloudinary answers 400 for a file it cannot read (a corrupt PDF, say): the sender's problem, not ours.
          if ((error as { http_code?: number } | undefined)?.http_code === 400) {
            reject(AppError.badRequest('That file could not be read. Check it opens, then upload it again.', { field: 'file' }));
            return;
          }
          if (error || !result) {
            reject(
              AppError.internal(
                'INTERNAL',
                { reason: 'DOCUMENT_UPLOAD_FAILED', documentType: meta.documentType },
                error,
              ),
            );
            return;
          }
          resolve({ url: result.secure_url, publicId: result.public_id });
        },
      );
      uploadStream.end(fileBuffer);
    });
  }

  async remove(publicId: string): Promise<void> {
    const result = await cloudinaryClient().uploader.destroy(publicId);
    // "not found" means the file is already gone — that's the goal state either way, not a
    // failure (decision 17's idempotent-delete rule).
    if (result.result !== 'ok' && result.result !== 'not found') {
      throw AppError.internal('INTERNAL', { reason: 'DOCUMENT_DELETE_FAILED', publicId, result: result.result });
    }
  }
}

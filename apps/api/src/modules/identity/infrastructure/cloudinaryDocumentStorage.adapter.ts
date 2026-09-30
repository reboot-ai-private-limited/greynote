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

import { v2 as cloudinary } from 'cloudinary';
import { env } from '@/config/env.js';
import { AppError } from '@/shared/errors/AppError.js';
import type { DocumentStoragePort, DocumentStorageUploadMeta } from '../domain/documentStorage.port.js';

let configured = false;

/**
 * Configured lazily, on first real use — not at boot. Every other route works fine without
 * Cloudinary configured; only this feature needs it.
 */
function ensureConfigured(): void {
  if (configured) return;
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    throw AppError.internal('INTERNAL', { reason: 'CLOUDINARY_NOT_CONFIGURED' });
  }
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
  });
  configured = true;
}

export class CloudinaryDocumentStorage implements DocumentStoragePort {
  upload(fileBuffer: Buffer, meta: DocumentStorageUploadMeta): Promise<{ url: string; publicId: string }> {
    ensureConfigured();
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
    ensureConfigured();
    const result = await cloudinary.uploader.destroy(publicId);
    // "not found" means the file is already gone — that's the goal state either way, not a
    // failure (decision 17's idempotent-delete rule).
    if (result.result !== 'ok' && result.result !== 'not found') {
      throw AppError.internal('INTERNAL', { reason: 'DOCUMENT_DELETE_FAILED', publicId, result: result.result });
    }
  }
}

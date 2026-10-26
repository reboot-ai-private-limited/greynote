import { AppError } from '@/shared/errors/AppError.js';
import { cloudinaryClient } from '@/shared/storage/cloudinary.js';
import type { DistributorDocumentStoragePort } from '../domain/distributorDocumentStorage.port.js';

export class CloudinaryDistributorDocumentStorage implements DistributorDocumentStoragePort {
  upload(file: Buffer, meta: { distributorId: string; documentType: string }): Promise<{ url: string; publicId: string }> {
    const cloudinary = cloudinaryClient();
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({ folder: `greynote/distributors/${meta.distributorId}/documents`, resource_type: 'auto' }, (error, result) => {
        // Cloudinary answers 400 for a file it cannot read (a corrupt PDF, say): the sender's problem, not ours.
        if ((error as { http_code?: number } | undefined)?.http_code === 400) {
          reject(AppError.badRequest('That file could not be read. Check it opens, then upload it again.', { field: 'file' }));
          return;
        }
        if (error || !result) {
          reject(AppError.internal('INTERNAL', { reason: 'DOCUMENT_UPLOAD_FAILED', documentType: meta.documentType }, error));
          return;
        }
        resolve({ url: result.secure_url, publicId: result.public_id });
      });
      stream.end(file);
    });
  }

  async remove(publicId: string): Promise<void> {
    const result = await cloudinaryClient().uploader.destroy(publicId);
    // "not found" means it is already gone, which is what the caller wanted.
    if (result.result !== 'ok' && result.result !== 'not found') {
      throw AppError.internal('INTERNAL', { reason: 'DOCUMENT_REMOVE_FAILED', result: result.result });
    }
  }
}

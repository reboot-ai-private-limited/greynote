import { AppError } from '@/shared/errors/AppError.js';
import { cloudinaryClient } from '@/shared/storage/cloudinary.js';
import type { SecondaryFileStoragePort } from '../domain/proofStorage.port.js';

export class CloudinarySecondaryFileStorage implements SecondaryFileStoragePort {
  upload(fileBuffer: Buffer, meta: { userId: string; month: string }): Promise<{ url: string; publicId: string }> {
    const cloudinary = cloudinaryClient();
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({ folder: `greynote/users/${meta.userId}/secondary/${meta.month}`, resource_type: 'auto' }, (error, result) => {
        // Cloudinary answers 400 for a file it cannot read (a corrupt PDF, say): the sender's problem, not ours.
        if ((error as { http_code?: number } | undefined)?.http_code === 400) {
          reject(AppError.badRequest('That file could not be read. Check it opens, then upload it again.', { field: 'file' }));
          return;
        }
        if (error || !result) {
          reject(AppError.internal('INTERNAL', { reason: 'SECONDARY_FILE_UPLOAD_FAILED' }, error));
          return;
        }
        resolve({ url: result.secure_url, publicId: result.public_id });
      });
      stream.end(fileBuffer);
    });
  }

  async remove(publicId: string): Promise<void> {
    const result = await cloudinaryClient().uploader.destroy(publicId);
    if (result.result !== 'ok' && result.result !== 'not found') throw AppError.internal('INTERNAL', { reason: 'SECONDARY_FILE_DELETE_FAILED', publicId, result: result.result });
  }
}

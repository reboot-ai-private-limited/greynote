import { AppError } from '@/shared/errors/AppError.js';
import { cloudinaryClient } from '@/shared/storage/cloudinary.js';
import type { FileStoragePort } from '../domain/ports.js';

export class CloudinaryLibraryStorage implements FileStoragePort {
  upload(file: Buffer, meta: { mimeType: string }): Promise<{ url: string; publicId: string }> {
    const cloudinary = cloudinaryClient();
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({ folder: 'greynote/library', resource_type: 'auto' }, (error, result) => {
        // Cloudinary answers 400 for a file it cannot read (a corrupt PDF, say): the uploader's problem, not ours.
        if ((error as { http_code?: number } | undefined)?.http_code === 400) return reject(AppError.badRequest('That file could not be read. Check it opens, then upload it again.', { field: 'file' }));
        if (error || !result) return reject(AppError.internal('INTERNAL', { reason: 'LIBRARY_UPLOAD_FAILED', mimeType: meta.mimeType }, error));
        resolve({ url: result.secure_url, publicId: result.public_id });
      });
      stream.end(file);
    });
  }

  async remove(publicId: string): Promise<void> {
    const result = await cloudinaryClient().uploader.destroy(publicId);
    if (result.result !== 'ok' && result.result !== 'not found') throw AppError.internal('INTERNAL', { reason: 'LIBRARY_DELETE_FAILED', publicId, result: result.result });
  }
}

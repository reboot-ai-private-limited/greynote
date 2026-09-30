import { AppError } from '@/shared/errors/AppError.js';
import { cloudinaryClient } from '@/shared/storage/cloudinary.js';
import type { VisualStoragePort } from '../domain/marketing.repository.ports.js';

export class CloudinaryVisualStorage implements VisualStoragePort {
  upload(file: Buffer, meta: { mimeType: string; folder: string }): Promise<{ url: string; publicId: string }> {
    const cloudinary = cloudinaryClient();
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({ folder: meta.folder, resource_type: 'auto' }, (error, result) => {
        // Cloudinary answers 400 for a file it cannot read (a corrupt PDF, say): the uploader's problem, not ours.
        if ((error as { http_code?: number } | undefined)?.http_code === 400) return reject(AppError.badRequest('That file could not be read. Check it opens, then upload it again.', { code: 'UNSUPPORTED_FILE' }));
        if (error || !result) return reject(AppError.internal('INTERNAL', { reason: 'VISUAL_UPLOAD_FAILED', mimeType: meta.mimeType }, error));
        resolve({ url: result.secure_url, publicId: result.public_id });
      });
      stream.end(file);
    });
  }

  async remove(publicId: string): Promise<void> {
    // Videos and images live under different resource types; try "image" (also PDFs) then "video". Not found is the goal state.
    const cloudinary = cloudinaryClient();
    for (const resource_type of ['image', 'video'] as const) {
      const result = await cloudinary.uploader.destroy(publicId, { resource_type });
      if (result.result === 'ok') return;
    }
  }
}

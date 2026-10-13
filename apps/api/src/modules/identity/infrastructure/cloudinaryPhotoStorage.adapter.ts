import { AppError } from '@/shared/errors/AppError.js';
import { cloudinaryClient } from '@/shared/storage/cloudinary.js';
import type { PhotoStoragePort } from '../domain/photoStorage.port.js';

export class CloudinaryPhotoStorage implements PhotoStoragePort {
  upload(fileBuffer: Buffer, folder: string): Promise<{ url: string; publicId: string }> {
    const cloudinary = cloudinaryClient();
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `greynote/${folder}/photo`,
          resource_type: 'image',
          // Kept small: a square around the face is all the screens and the phone need.
          transformation: [{ width: 512, height: 512, crop: 'fill', gravity: 'auto', quality: 'auto' }],
        },
        (error, result) => {
          if ((error as { http_code?: number } | undefined)?.http_code === 400) {
            reject(AppError.badRequest('That photo could not be read. Choose another one.', { field: 'file' }));
            return;
          }
          if (error || !result) {
            reject(AppError.internal('INTERNAL', { reason: 'PHOTO_UPLOAD_FAILED' }, error));
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
    if (result.result !== 'ok' && result.result !== 'not found') {
      throw AppError.internal('INTERNAL', { reason: 'PHOTO_DELETE_FAILED', publicId, result: result.result });
    }
  }
}

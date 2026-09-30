import { v2 as cloudinary } from 'cloudinary';
import { env } from '@/config/env.js';
import { AppError } from '@/shared/errors/AppError.js';

let configured = false;

/**
 * Cloudinary, configured lazily on first real use — not at boot. Every route that does not upload works without it;
 * only an upload (Identity's documents, Marketing's Visuals) needs the three variables.
 */
export function cloudinaryClient(): typeof cloudinary {
  if (!configured) {
    if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
      throw AppError.internal('INTERNAL', { reason: 'CLOUDINARY_NOT_CONFIGURED' });
    }
    cloudinary.config({ cloud_name: env.CLOUDINARY_CLOUD_NAME, api_key: env.CLOUDINARY_API_KEY, api_secret: env.CLOUDINARY_API_SECRET });
    configured = true;
  }
  return cloudinary;
}

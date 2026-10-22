import { randomUUID } from 'node:crypto';
import { AppError } from '@/shared/errors/AppError.js';
import { cloudinaryClient } from '@/shared/storage/cloudinary.js';
import type { AttachmentStoragePort } from '../domain/ports.js';

/**
 * Inbox attachments in Cloudinary (`greynote/inbox`). PDFs and pictures go up as images; Word, Excel and PowerPoint as
 * raw files, whose id must carry the extension so the delivered file opens in the right app.
 */
export class CloudinaryAttachmentStorage implements AttachmentStoragePort {
  upload(file: Buffer, meta: { resourceType: 'image' | 'raw'; extension: string; mimeType: string }): Promise<{ url: string; publicId: string }> {
    const cloudinary = cloudinaryClient();
    const options = meta.resourceType === 'raw' ? { folder: 'greynote/inbox', resource_type: 'raw' as const, public_id: `${randomUUID()}.${meta.extension}` } : { folder: 'greynote/inbox', resource_type: 'image' as const };
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
        // Cloudinary answers 400 for a file it cannot read (a corrupt PDF, say): the sender's problem, not ours.
        if ((error as { http_code?: number } | undefined)?.http_code === 400) return reject(AppError.badRequest('An attachment could not be read. Check it opens, then attach it again.', { field: 'files' }));
        if (error || !result) return reject(AppError.internal('INTERNAL', { reason: 'INBOX_UPLOAD_FAILED', mimeType: meta.mimeType }, error));
        resolve({ url: result.secure_url, publicId: result.public_id });
      });
      stream.end(file);
    });
  }

  async remove(publicId: string, resourceType: 'image' | 'raw'): Promise<void> {
    const result = await cloudinaryClient().uploader.destroy(publicId, { resource_type: resourceType });
    if (result.result !== 'ok' && result.result !== 'not found') throw AppError.internal('INTERNAL', { reason: 'INBOX_ATTACHMENT_DELETE_FAILED', publicId, result: result.result });
  }
}

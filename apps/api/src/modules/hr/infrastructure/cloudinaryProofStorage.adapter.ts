import { AppError } from '@/shared/errors/AppError.js';
import { cloudinaryClient } from '@/shared/storage/cloudinary.js';
import type { ProofStoragePort } from '../domain/proofStorage.port.js';

export class CloudinaryProofStorage implements ProofStoragePort {
  upload(fileBuffer: Buffer, meta: { userId: string; leaveId: string }): Promise<{ url: string; publicId: string }> {
    const cloudinary = cloudinaryClient();
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({ folder: `greynote/users/${meta.userId}/leave-proof/${meta.leaveId}`, resource_type: 'auto' }, (error, result) => {
        // Cloudinary answers 400 for a file it cannot read (a corrupt PDF, say): the sender's problem, not ours.
        if ((error as { http_code?: number } | undefined)?.http_code === 400) {
          reject(AppError.badRequest('That file could not be read. Check it opens, then upload it again.', { field: 'file' }));
          return;
        }
        if (error || !result) {
          reject(AppError.internal('INTERNAL', { reason: 'LEAVE_PROOF_UPLOAD_FAILED' }, error));
          return;
        }
        resolve({ url: result.secure_url, publicId: result.public_id });
      });
      stream.end(fileBuffer);
    });
  }

  async remove(publicId: string): Promise<void> {
    const result = await cloudinaryClient().uploader.destroy(publicId);
    if (result.result !== 'ok' && result.result !== 'not found') throw AppError.internal('INTERNAL', { reason: 'LEAVE_PROOF_DELETE_FAILED', publicId, result: result.result });
  }
}

import { AppError } from '@/shared/errors/AppError.js';
import { logger } from '@/shared/logging/logger.js';
import { PHOTO_FILE_MESSAGE, isPhotoFile } from '@/shared/storage/photoFile.js';
import type { PhotoStoragePort } from '@/shared/storage/photoStorage.port.js';
import type { Actor } from '../actor.js';
import type { ApprovalsPort } from '../../domain/approvals.port.js';
import type { Doctor } from '../../domain/doctor.entity.js';
import type { DoctorRepositoryPort } from '../../domain/doctor.repository.port.js';
import { NEW_DOCTOR_KIND } from '../doctorApproval.js';

/** What the screens get: the address only. The storage id never leaves the server. */
export interface DoctorPhotoView {
  photoUrl: string | null;
}

/** Best effort: the change is already saved, so a failed clean-up of the old file is logged, not raised. */
async function discard(storage: PhotoStoragePort, publicId: string | undefined, context: string): Promise<void> {
  if (!publicId) return;
  try {
    await storage.remove(publicId);
  } catch (error) {
    logger.error({ err: error, publicId, context }, 'doctor photo: could not delete from storage');
  }
}

/**
 * Who may change a doctor's photo: Admin, any doctor; the MR who added it, until it is approved (while waiting, or sent back).
 * An approved doctor is Admin's. The photo is not a field of the approval, so changing it never resubmits the request.
 */
class DoctorPhotoAccess {
  constructor(
    private readonly doctors: DoctorRepositoryPort,
    private readonly approvals: Pick<ApprovalsPort, 'getForRecord'>,
  ) {}

  async require(actor: Actor, doctorId: string): Promise<Doctor> {
    const doctor = await this.doctors.findById(doctorId);
    if (!doctor) throw AppError.notFound('No such doctor.');
    if (actor.role === 'ADMIN') return doctor;
    if (doctor.addedBy !== actor.id || doctor.clientRequestId === null) throw AppError.notFound('No such doctor.');
    const request = await this.approvals.getForRecord(NEW_DOCTOR_KIND, doctor.id);
    if (!request || request.status === 'APPROVED') throw AppError.conflict('This doctor is approved and its photo can’t be changed. Ask Admin.');
    return doctor;
  }
}

/** Sets or replaces a doctor's photo: store the new file, save the reference, then delete the old file (and the new one if saving fails). */
export class SetDoctorPhotoUseCase {
  private readonly access: DoctorPhotoAccess;

  constructor(
    private readonly doctors: DoctorRepositoryPort,
    approvals: Pick<ApprovalsPort, 'getForRecord'>,
    private readonly storage: PhotoStoragePort,
  ) {
    this.access = new DoctorPhotoAccess(doctors, approvals);
  }

  async execute(actor: Actor, doctorId: string, file: Buffer): Promise<DoctorPhotoView> {
    const doctor = await this.access.require(actor, doctorId);
    if (!isPhotoFile(file)) throw AppError.badRequest(PHOTO_FILE_MESSAGE, { field: 'file' });
    const uploaded = await this.storage.upload(file, `doctors/${doctorId}`);
    try {
      await this.doctors.update(doctorId, { photo: uploaded });
    } catch (error) {
      await discard(this.storage, uploaded.publicId, 'save failed');
      throw error;
    }
    await discard(this.storage, doctor.photo?.publicId, 'replaced');
    return { photoUrl: uploaded.url };
  }
}

/** Removes the file from storage first; if that fails the record is kept so a retry still finds it. */
export class RemoveDoctorPhotoUseCase {
  private readonly access: DoctorPhotoAccess;

  constructor(
    private readonly doctors: DoctorRepositoryPort,
    approvals: Pick<ApprovalsPort, 'getForRecord'>,
    private readonly storage: PhotoStoragePort,
  ) {
    this.access = new DoctorPhotoAccess(doctors, approvals);
  }

  async execute(actor: Actor, doctorId: string): Promise<DoctorPhotoView> {
    const doctor = await this.access.require(actor, doctorId);
    if (doctor.photo) {
      await this.storage.remove(doctor.photo.publicId);
      await this.doctors.update(doctorId, { photo: null });
    }
    return { photoUrl: null };
  }
}

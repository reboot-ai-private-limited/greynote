import { AppError } from '@/shared/errors/AppError.js';
import type { EmployeeDraftRepositoryPort } from '../../domain/employeeDraft.repository.port.js';
import type { ProfilePhoto } from '../../domain/employeeProfile.entity.js';
import type { EmployeeProfileRepositoryPort } from '../../domain/employeeProfile.repository.port.js';
import { PHOTO_FILE_MESSAGE, isPhotoFile } from '@/shared/storage/photoFile.js';
import type { PhotoStoragePort } from '@/shared/storage/photoStorage.port.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';

/** What the screens get: the address only. The storage id never leaves the server. */
export interface PhotoView {
  photoUrl: string | null;
}

const view = (photo: ProfilePhoto | null | undefined): PhotoView => ({ photoUrl: photo?.url ?? null });

function assertPhoto(file: Buffer): void {
  if (!isPhotoFile(file)) throw AppError.badRequest(PHOTO_FILE_MESSAGE, { field: 'file' });
}

/** Best effort: the new photo is already saved, so a failed clean-up of the old one is logged, not raised. */
async function discard(storage: PhotoStoragePort, publicId: string | undefined, context: string): Promise<void> {
  if (!publicId) return;
  try {
    await storage.remove(publicId);
  } catch (error) {
    console.error(`[photo] could not delete ${publicId} (${context})`, error);
  }
}

/**
 * Sets or replaces an employee's photo: store the new file, save the reference, then delete the old
 * file. If saving fails the new file is deleted, so nothing is left behind either way.
 */
export class SetEmployeePhotoUseCase {
  constructor(
    private readonly users: UserRepositoryPort,
    private readonly profiles: EmployeeProfileRepositoryPort,
    private readonly storage: PhotoStoragePort,
  ) {}

  async execute(userId: string, file: Buffer): Promise<PhotoView> {
    if (!(await this.users.findById(userId))) throw AppError.notFound();
    assertPhoto(file);
    const uploaded = await this.storage.upload(file, `users/${userId}`);
    const previous = (await this.profiles.findByUserId(userId))?.photo?.publicId;
    try {
      await this.profiles.upsert(userId, { photo: uploaded });
    } catch (error) {
      await discard(this.storage, uploaded.publicId, 'save failed');
      throw error;
    }
    await discard(this.storage, previous, 'replaced');
    return view(uploaded);
  }
}

/** Removes the photo from Cloudinary first; if that fails the record is kept so a retry still finds it. */
export class RemoveEmployeePhotoUseCase {
  constructor(
    private readonly profiles: EmployeeProfileRepositoryPort,
    private readonly storage: PhotoStoragePort,
  ) {}

  async execute(userId: string): Promise<PhotoView> {
    const photo = (await this.profiles.findByUserId(userId))?.photo;
    if (photo) {
      await this.storage.remove(photo.publicId);
      await this.profiles.upsert(userId, { photo: null });
    }
    return view(null);
  }
}

/** The same for a draft, whose photo sits in `data.photo` (its own section, so saving Personal never wipes it). */
export class SetDraftPhotoUseCase {
  constructor(
    private readonly drafts: EmployeeDraftRepositoryPort,
    private readonly storage: PhotoStoragePort,
  ) {}

  async execute(draftId: string, file: Buffer): Promise<PhotoView> {
    const draft = await this.drafts.findById(draftId);
    if (!draft) throw AppError.notFound('No such draft.');
    assertPhoto(file);
    const uploaded = await this.storage.upload(file, `drafts/${draftId}`);
    try {
      await this.drafts.update(draftId, { data: { ...draft.data, photo: uploaded } });
    } catch (error) {
      await discard(this.storage, uploaded.publicId, 'draft save failed');
      throw error;
    }
    await discard(this.storage, draft.data.photo?.publicId, 'draft photo replaced');
    return view(uploaded);
  }
}

export class RemoveDraftPhotoUseCase {
  constructor(
    private readonly drafts: EmployeeDraftRepositoryPort,
    private readonly storage: PhotoStoragePort,
  ) {}

  async execute(draftId: string): Promise<PhotoView> {
    const draft = await this.drafts.findById(draftId);
    if (!draft) throw AppError.notFound('No such draft.');
    const photo = draft.data.photo;
    if (photo) {
      await this.storage.remove(photo.publicId);
      const { photo: _gone, ...rest } = draft.data;
      await this.drafts.update(draftId, { data: rest });
    }
    return view(null);
  }
}

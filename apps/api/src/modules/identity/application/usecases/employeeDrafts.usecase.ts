import { AppError } from '@/shared/errors/AppError.js';
import type { EmployeeDraft, EmployeeDraftData } from '../../domain/employeeDraft.entity.js';
import type { EmployeeDraftRepositoryPort } from '../../domain/employeeDraft.repository.port.js';
import type { PhotoStoragePort } from '../../domain/photoStorage.port.js';

export interface EmployeeDraftInput {
  step?: number;
  data?: EmployeeDraftData;
}

/** Saves a new draft. */
export class CreateEmployeeDraftUseCase {
  constructor(private readonly drafts: EmployeeDraftRepositoryPort) {}

  execute(createdBy: string, input: EmployeeDraftInput): Promise<EmployeeDraft> {
    return this.drafts.create({ createdBy, step: input.step ?? 1, data: input.data ?? {} });
  }
}

export class ListEmployeeDraftsUseCase {
  constructor(private readonly drafts: EmployeeDraftRepositoryPort) {}

  execute(): Promise<EmployeeDraft[]> {
    return this.drafts.list();
  }
}

export class GetEmployeeDraftUseCase {
  constructor(private readonly drafts: EmployeeDraftRepositoryPort) {}

  async execute(id: string): Promise<EmployeeDraft> {
    const draft = await this.drafts.findById(id);
    if (!draft) throw AppError.notFound('No such draft.');
    return draft;
  }
}

/**
 * A section sent replaces that section whole; a section not sent stays as it was. The step only
 * ever moves forward, so going back to fix something does not lose how far the draft got.
 */
export class UpdateEmployeeDraftUseCase {
  constructor(private readonly drafts: EmployeeDraftRepositoryPort) {}

  async execute(id: string, input: EmployeeDraftInput): Promise<EmployeeDraft> {
    const existing = await this.drafts.findById(id);
    if (!existing) throw AppError.notFound('No such draft.');
    const updated = await this.drafts.update(id, {
      data: { ...existing.data, ...input.data },
      step: Math.max(existing.step, input.step ?? existing.step),
    });
    if (!updated) throw AppError.notFound('No such draft.');
    return updated;
  }
}

export class DeleteEmployeeDraftUseCase {
  constructor(
    private readonly drafts: EmployeeDraftRepositoryPort,
    private readonly photos: PhotoStoragePort,
  ) {}

  async execute(id: string): Promise<void> {
    const existing = await this.drafts.findById(id);
    if (!existing) throw AppError.notFound('No such draft.');
    if (existing.createdUserId) {
      throw AppError.conflict('This draft already created a login. Finish it instead of deleting it.');
    }
    // Storage first: if it fails the draft still points at the photo and the delete can be retried.
    if (existing.data.photo) await this.photos.remove(existing.data.photo.publicId);
    await this.drafts.delete(id);
  }
}

/** What a client sees of a draft: the photo's address only, never its storage id. */
export function toDraftView(draft: EmployeeDraft): Omit<EmployeeDraft, 'data'> & { data: Omit<EmployeeDraftData, 'photo'> & { photoUrl?: string } } {
  const { photo, ...data } = draft.data;
  return { ...draft, data: { ...data, ...(photo && { photoUrl: photo.url }) } };
}

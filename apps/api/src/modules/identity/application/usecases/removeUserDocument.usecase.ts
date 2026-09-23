import { AppError } from '@/shared/errors/AppError.js';
import type { DocumentStoragePort } from '../../domain/documentStorage.port.js';
import type { EmployeeProfileRepositoryPort } from '../../domain/employeeProfile.repository.port.js';

/**
 * Removes a document from Cloudinary before touching the DB record (decision 17) — a DB-only
 * delete would orphan the file in Cloudinary forever. If Cloudinary's destroy call fails for a
 * real reason (not "already gone"), the DB record is left untouched so the two never drift out
 * of sync.
 */
export class RemoveUserDocumentUseCase {
  constructor(
    private readonly employeeProfileRepository: EmployeeProfileRepositoryPort,
    private readonly documentStorage: DocumentStoragePort,
  ) {}

  async execute(targetUserId: string, documentId: string): Promise<void> {
    const profile = await this.employeeProfileRepository.findByUserId(targetUserId);
    if (!profile) throw AppError.notFound();

    const document = profile.documents.find((d) => d.id === documentId);
    if (!document) throw AppError.notFound();

    await this.documentStorage.remove(document.publicId);

    const documents = profile.documents.filter((d) => d.id !== documentId);
    await this.employeeProfileRepository.upsert(targetUserId, { documents });
  }
}

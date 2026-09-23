import { AppError } from '@/shared/errors/AppError.js';
import type { DocumentStoragePort } from '../../domain/documentStorage.port.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';

/**
 * Removes a document from Cloudinary before touching the DB record (decision 17) — a DB-only
 * delete would orphan the file in Cloudinary forever. If Cloudinary's destroy call fails for a
 * real reason (not "already gone"), the DB record is left untouched so the two never drift out
 * of sync.
 */
export class RemoveUserDocumentUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly documentStorage: DocumentStoragePort,
  ) {}

  async execute(targetUserId: string, documentId: string): Promise<void> {
    const user = await this.userRepository.findById(targetUserId);
    if (!user) throw AppError.notFound();

    const document = user.documents.find((d) => d.id === documentId);
    if (!document) throw AppError.notFound();

    await this.documentStorage.remove(document.publicId);

    const documents = user.documents.filter((d) => d.id !== documentId);
    await this.userRepository.update(targetUserId, { documents });
  }
}

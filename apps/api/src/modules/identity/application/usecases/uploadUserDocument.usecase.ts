import { v7 as uuidv7 } from 'uuid';
import { AppError } from '@/shared/errors/AppError.js';
import { DOCUMENT_FILE_MESSAGE, detectDocumentKind } from '../../domain/documentFile.js';
import type { DocumentStoragePort } from '../../domain/documentStorage.port.js';
import type { UserDocument } from '../../domain/employeeProfile.entity.js';
import type { EmployeeProfileRepositoryPort } from '../../domain/employeeProfile.repository.port.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';

export class UploadUserDocumentUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly employeeProfileRepository: EmployeeProfileRepositoryPort,
    private readonly documentStorage: DocumentStoragePort,
  ) {}

  async execute(
    targetUserId: string,
    documentType: string,
    fileBuffer: Buffer,
    mimeType: string,
  ): Promise<UserDocument> {
    const user = await this.userRepository.findById(targetUserId);
    if (!user) throw AppError.notFound();

    // Before anything is stored: a refused file never reaches Cloudinary.
    if (detectDocumentKind(fileBuffer) === null) {
      throw AppError.badRequest(DOCUMENT_FILE_MESSAGE, { field: 'file' });
    }

    const { url, publicId } = await this.documentStorage.upload(fileBuffer, {
      userId: targetUserId,
      documentType,
      mimeType,
    });

    const document: UserDocument = { id: uuidv7(), type: documentType, url, publicId, uploadedAt: new Date() };

    const existingProfile = await this.employeeProfileRepository.findByUserId(targetUserId);
    const documents = [...(existingProfile?.documents ?? []), document];

    // Documents aren't in the required-for-activation set, so this upsert is a no-op status-wise
    // — creating an EmployeeProfile row with only `documents` set (everything else null) is fine;
    // `computeUserStatus` reads a missing/incomplete profile as `pending`, same as before a
    // document was ever uploaded.
    await this.employeeProfileRepository.upsert(targetUserId, { documents });

    return document;
  }
}

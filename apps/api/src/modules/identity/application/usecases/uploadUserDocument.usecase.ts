import { v7 as uuidv7 } from 'uuid';
import { AppError } from '@/shared/errors/AppError.js';
import type { DocumentStoragePort } from '../../domain/documentStorage.port.js';
import { computeUserStatus } from '../../domain/onboarding.js';
import type { RoleRepositoryPort } from '../../domain/role.repository.port.js';
import type { UserDocument } from '../../domain/user.entity.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';

export class UploadUserDocumentUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly roleRepository: RoleRepositoryPort,
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

    const role = await this.roleRepository.findById(user.roleId);
    if (!role) throw AppError.internal('INTERNAL', { reason: 'ROLE_NOT_FOUND', roleId: user.roleId });

    const { url, publicId } = await this.documentStorage.upload(fileBuffer, {
      userId: targetUserId,
      documentType,
      mimeType,
    });

    const document: UserDocument = { id: uuidv7(), type: documentType, url, publicId, uploadedAt: new Date() };
    const documents = [...user.documents, document];

    // Documents aren't in the required-for-activation set today, so this recompute is a no-op
    // status-wise unless that set changes later — still run it so behaviour stays consistent
    // with every other field-carrying use case.
    const status = computeUserStatus({ ...user, documents }, role.name);

    await this.userRepository.update(targetUserId, { documents, status });

    return document;
  }
}

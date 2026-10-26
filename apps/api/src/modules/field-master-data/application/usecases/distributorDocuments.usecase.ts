import { v7 as uuidv7 } from 'uuid';
import { AppError } from '@/shared/errors/AppError.js';
import type { DistributorDocument, DistributorDocumentType } from '../../domain/distributor.entity.js';
import type { DistributorRepositoryPort } from '../../domain/distributor.repository.port.js';
import { DISTRIBUTOR_DOCUMENT_FILE_MESSAGE, isDocumentFile } from '../../domain/distributorDocumentFile.js';
import type { DistributorDocumentStoragePort } from '../../domain/distributorDocumentStorage.port.js';

/** Admin or Accountant attaches a file (licence, GST certificate, agreement…) to a Distributor. Several of one type are fine. */
export class UploadDistributorDocumentUseCase {
  constructor(
    private readonly distributors: DistributorRepositoryPort,
    private readonly storage: DistributorDocumentStoragePort,
  ) {}

  async execute(id: string, type: DistributorDocumentType, file: Buffer | undefined): Promise<DistributorDocument> {
    if (!(await this.distributors.findById(id))) throw AppError.notFound('No such distributor.');
    // Before anything is stored: a refused file never reaches Cloudinary.
    if (!file || !isDocumentFile(file)) throw AppError.badRequest(DISTRIBUTOR_DOCUMENT_FILE_MESSAGE, { field: 'file' });
    const { url, publicId } = await this.storage.upload(file, { distributorId: id, documentType: type });
    const document: DistributorDocument = { id: uuidv7(), type, url, publicId, uploadedAt: new Date() };
    if (!(await this.distributors.addDocument(id, document))) {
      await this.storage.remove(publicId);
      throw AppError.notFound('No such distributor.');
    }
    return document;
  }
}

/** Takes the file out of storage first, then off the record, so the two never drift apart. */
export class RemoveDistributorDocumentUseCase {
  constructor(
    private readonly distributors: DistributorRepositoryPort,
    private readonly storage: DistributorDocumentStoragePort,
  ) {}

  async execute(id: string, documentId: string): Promise<void> {
    const distributor = await this.distributors.findById(id);
    const document = distributor?.documents.find((d) => d.id === documentId);
    if (!distributor || !document) throw AppError.notFound('No such document.');
    await this.storage.remove(document.publicId);
    await this.distributors.removeDocument(id, documentId);
  }
}

import type { CompanyDocumentDto } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import { detectDocumentKind, DOCUMENT_FILE_MESSAGE } from '../../domain/documentFile.js';
import type { CompanyDocument, CompanyDocumentCategory } from '../../domain/companyDocument.entity.js';
import type { CompanyDocumentRepositoryPort } from '../../domain/documents.repository.port.js';
import type { FileStoragePort, RecipientDirectoryPort } from '../../domain/ports.js';

const MIME = { pdf: 'application/pdf', jpeg: 'image/jpeg', png: 'image/png' } as const;

/** The Admin's view carries the audience; an employee only learns that the file is theirs. */
export function toDocumentDto(d: CompanyDocument, withAudience: boolean): CompanyDocumentDto {
  return {
    id: d.id,
    title: d.title,
    category: d.category,
    fileKind: d.fileKind,
    url: d.url,
    sizeBytes: d.sizeBytes,
    everyone: d.everyone,
    ...(withAudience && { userIds: d.userIds }),
    uploadedAt: d.uploadedAt.toISOString(),
  };
}

export interface UploadDocumentInput {
  title: string;
  category: CompanyDocumentCategory;
  /** Empty means every field employee. */
  userIds: string[];
  file: Buffer;
}

/** Admin puts a file in the library, for everyone or for the named active field employees. */
export class UploadDocumentUseCase {
  constructor(
    private readonly docs: CompanyDocumentRepositoryPort,
    private readonly storage: FileStoragePort,
    private readonly directory: RecipientDirectoryPort,
  ) {}

  async execute(adminId: string, input: UploadDocumentInput): Promise<CompanyDocument> {
    const kind = detectDocumentKind(input.file);
    if (!kind) throw AppError.badRequest(DOCUMENT_FILE_MESSAGE, { field: 'file', code: 'UNSUPPORTED_FILE' });
    const userIds = [...new Set(input.userIds)];
    if (userIds.length > 0) {
      const active = new Set((await this.directory.listActiveRecipients()).filter((r) => r.role === 'FIELD').map((r) => r.id));
      const unknown = userIds.filter((id) => !active.has(id));
      if (unknown.length > 0) throw AppError.badRequest('Some of the chosen people are not active field employees.', { field: 'userIds', userIds: unknown });
    }
    const stored = await this.storage.upload(input.file, { mimeType: MIME[kind] });
    try {
      return await this.docs.create({ title: input.title, category: input.category, fileKind: kind, url: stored.url, publicId: stored.publicId, sizeBytes: input.file.length, everyone: userIds.length === 0, userIds, uploadedBy: adminId });
    } catch (err) {
      await this.storage.remove(stored.publicId).catch(() => undefined);
      throw err;
    }
  }
}

export class ListDocumentsUseCase {
  constructor(private readonly docs: CompanyDocumentRepositoryPort) {}

  /** Admin: the whole library. Anyone else: what is for everyone or names them. */
  async execute(actor: { id: string; role: string }): Promise<CompanyDocumentDto[]> {
    const admin = actor.role === 'ADMIN';
    const items = admin ? await this.docs.listAll() : await this.docs.listVisibleTo(actor.id);
    return items.map((d) => toDocumentDto(d, admin));
  }
}

export class DeleteDocumentUseCase {
  constructor(
    private readonly docs: CompanyDocumentRepositoryPort,
    private readonly storage: FileStoragePort,
  ) {}

  async execute(id: string): Promise<void> {
    const doc = await this.docs.findById(id);
    if (!doc) throw AppError.notFound('No such document.');
    await this.storage.remove(doc.publicId);
    await this.docs.delete(id);
  }
}

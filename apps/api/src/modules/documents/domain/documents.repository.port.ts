import type { CompanyDocument } from './companyDocument.entity.js';

export interface CompanyDocumentRepositoryPort {
  create(input: Omit<CompanyDocument, 'id' | 'uploadedAt'>): Promise<CompanyDocument>;
  findById(id: string): Promise<CompanyDocument | null>;
  /** Newest first. */
  listAll(): Promise<CompanyDocument[]>;
  /** Newest first: the ones for everyone and the ones naming this person. */
  listVisibleTo(userId: string): Promise<CompanyDocument[]>;
  delete(id: string): Promise<boolean>;
}

export const COMPANY_DOCUMENT_CATEGORIES = ['POLICY', 'CIRCULAR', 'FORM', 'OTHER'] as const;
export type CompanyDocumentCategory = (typeof COMPANY_DOCUMENT_CATEGORIES)[number];

/** A file an Admin put in the library: for everyone, or for the named employees only. */
export interface CompanyDocumentDto {
  id: string;
  title: string;
  category: CompanyDocumentCategory;
  /** `pdf`, `jpeg` or `png`, read from the file itself. */
  fileKind: 'pdf' | 'jpeg' | 'png';
  url: string;
  sizeBytes: number;
  /** True when every field employee sees it. */
  everyone: boolean;
  /** Admin's list only; an employee never sees who else it is for. */
  userIds?: string[];
  uploadedAt: string;
}

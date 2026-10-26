export interface DistributorDocumentStoragePort {
  upload(file: Buffer, meta: { distributorId: string; documentType: string }): Promise<{ url: string; publicId: string }>;
  /** Deleting a document removes it from storage too — a DB-only delete would orphan the file. */
  remove(publicId: string): Promise<void>;
}

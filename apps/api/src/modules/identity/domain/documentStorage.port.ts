export interface DocumentStorageUploadMeta {
  userId: string;
  documentType: string;
  mimeType: string;
}

export interface DocumentStoragePort {
  upload(fileBuffer: Buffer, meta: DocumentStorageUploadMeta): Promise<{ url: string; publicId: string }>;
  /** Deleting a document removes it from storage too — a DB-only delete would orphan the file. */
  remove(publicId: string): Promise<void>;
}

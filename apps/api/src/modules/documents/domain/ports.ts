/** The Documents module's narrow view of Identity; `identity.contract` satisfies it structurally. */
export interface RecipientDirectoryPort {
  listActiveRecipients(): Promise<Array<{ id: string; role: string }>>;
}

export interface FileStoragePort {
  upload(file: Buffer, meta: { mimeType: string }): Promise<{ url: string; publicId: string }>;
  /** Deleting a document removes the file too — a DB-only delete would orphan it. */
  remove(publicId: string): Promise<void>;
}

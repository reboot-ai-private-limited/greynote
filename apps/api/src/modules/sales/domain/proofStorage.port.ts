/** Where a month's secondary files live. Sales' own small port: a module's internals are private, so it does not borrow another module's. */
export interface SecondaryFileStoragePort {
  upload(fileBuffer: Buffer, meta: { userId: string; month: string }): Promise<{ url: string; publicId: string }>;
  /** Removing a record removes its file too — a database-only delete would orphan it. A file already gone is fine. */
  remove(publicId: string): Promise<void>;
}

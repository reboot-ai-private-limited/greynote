/** Where an expense's proof files live. Field Activity's own small port: a module's internals are private, so it does not borrow HR's. */
export interface ProofStoragePort {
  upload(fileBuffer: Buffer, meta: { userId: string; expenseId: string }): Promise<{ url: string; publicId: string }>;
  /** Removing a record removes its file too — a database-only delete would orphan it. A file already gone is fine. */
  remove(publicId: string): Promise<void>;
}

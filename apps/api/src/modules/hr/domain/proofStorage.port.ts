/** Where a leave's proof files live. HR's own small port: a module's internals are private, so it does not borrow Identity's. */
export interface ProofStoragePort {
  upload(fileBuffer: Buffer, meta: { userId: string; leaveId: string }): Promise<{ url: string; publicId: string }>;
  /** Removing a record removes its file too — a database-only delete would orphan it. A file already gone is fine. */
  remove(publicId: string): Promise<void>;
}

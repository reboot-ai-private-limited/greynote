export interface PhotoStoragePort {
  /** `folder` is e.g. `users/{id}` or `drafts/{id}`; the file lands in `greynote/{folder}/photo`. */
  upload(fileBuffer: Buffer, folder: string): Promise<{ url: string; publicId: string }>;
  /** Replacing or removing a photo removes it from storage too — a DB-only change would orphan the file. */
  remove(publicId: string): Promise<void>;
}

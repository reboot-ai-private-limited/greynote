/**
 * A file (a photo or PDF) attached to one employee's secondary for one month, as proof of the figures (decision-log 2026-11-02). It belongs to
 * the employee and the month, not to a product line, and there is no cap on how many. Each file is its own record, so adding two at once never
 * overwrites either.
 */
export interface SecondaryAttachment {
  id: string;
  userId: string;
  month: string;
  url: string;
  /** The storage id; what removing the file needs. */
  publicId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  uploadedAt: Date;
}

export const MAX_SECONDARY_ATTACHMENT_BYTES = 5 * 1024 * 1024;

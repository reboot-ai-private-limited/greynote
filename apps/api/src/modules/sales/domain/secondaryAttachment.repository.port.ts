import type { SecondaryAttachment } from './secondaryAttachment.entity.js';

export interface SecondaryAttachmentRepositoryPort {
  add(input: Omit<SecondaryAttachment, 'id'>): Promise<SecondaryAttachment>;
  /** One employee's files for a month, oldest first. */
  list(userId: string, month: string): Promise<SecondaryAttachment[]>;
  findById(id: string): Promise<SecondaryAttachment | null>;
  /** `false` when it was already gone. */
  remove(id: string): Promise<boolean>;
}

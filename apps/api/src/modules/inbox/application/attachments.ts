import type { InboxAttachmentDto } from '@greynote/contracts';
import { downloadUrlOf } from '@/shared/storage/downloadUrl.js';
import type { ReceiptAttachment } from '../domain/attachment.js';

/** An attachment as the API shows it: `downloadUrl` saves the file under its own name. */
export const toAttachmentDto = (a: ReceiptAttachment): InboxAttachmentDto => ({
  id: a.id,
  name: a.name,
  kind: a.kind,
  sizeBytes: a.sizeBytes,
  url: a.url,
  downloadUrl: downloadUrlOf(a.url, a.name),
});

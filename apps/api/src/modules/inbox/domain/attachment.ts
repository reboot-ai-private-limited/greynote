import type { InboxAttachmentKind } from '@greynote/contracts';

export { INBOX_ATTACHMENT_KINDS, INBOX_ATTACHMENT_MAX_BYTES, INBOX_MAX_ATTACHMENTS } from '@greynote/contracts';
export type { InboxAttachmentKind } from '@greynote/contracts';

/** A file on a message. `publicId` and `resourceType` are what the store needs to delete it; neither leaves the API. */
export interface InboxAttachment {
  id: string;
  name: string;
  kind: InboxAttachmentKind;
  sizeBytes: number;
  url: string;
  publicId: string;
  resourceType: 'image' | 'raw';
}

/** What a recipient's copy keeps of an attachment: enough to show, open and download it. */
export type ReceiptAttachment = Omit<InboxAttachment, 'publicId' | 'resourceType'>;

export const ATTACHMENT_FILE_MESSAGE = 'Attach a PDF, a picture (JPG, PNG, WebP), or a Word, Excel or PowerPoint file.';

export const ATTACHMENT_MIME: Record<InboxAttachmentKind, string> = {
  pdf: 'application/pdf',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

export const ATTACHMENT_EXTENSION: Record<InboxAttachmentKind, string> = { pdf: 'pdf', jpeg: 'jpg', png: 'png', webp: 'webp', docx: 'docx', xlsx: 'xlsx', pptx: 'pptx' };

const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/**
 * The type from the file's own bytes, never its name or the declared `Content-Type`. Word, Excel and PowerPoint files
 * are ZIP archives; which one is told by the folder their parts sit in (`word/`, `xl/`, `ppt/`), whose names are stored
 * uncompressed in the archive. The old binary `.doc`/`.xls`/`.ppt` formats are not accepted.
 */
export function detectAttachmentKind(file: Buffer): InboxAttachmentKind | null {
  if (file.subarray(0, 1024).includes('%PDF-')) return 'pdf';
  if (file.length >= 3 && file[0] === 0xff && file[1] === 0xd8 && file[2] === 0xff) return 'jpeg';
  if (file.length >= 8 && file.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (file.length >= 12 && file.subarray(0, 4).toString('latin1') === 'RIFF' && file.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (file.length >= 4 && file.subarray(0, 4).equals(ZIP) && file.includes('[Content_Types].xml')) {
    if (file.includes('word/')) return 'docx';
    if (file.includes('xl/')) return 'xlsx';
    if (file.includes('ppt/')) return 'pptx';
  }
  return null;
}

/** Office files are stored as Cloudinary "raw" files (delivered as they are); PDFs and pictures as images. */
export const resourceTypeOf = (kind: InboxAttachmentKind): 'image' | 'raw' => (kind === 'docx' || kind === 'xlsx' || kind === 'pptx' ? 'raw' : 'image');

/** The uploaded name, trimmed to something a phone can show: no folders, no control characters, at most 120. */
export function cleanFileName(name: string, kind: InboxAttachmentKind): string {
  // Multer reads the multipart filename as latin1; browsers send UTF-8.
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  const base = (decoded.includes('\uFFFD') ? name : decoded).split(/[\\/]/).pop() ?? '';
  const clean = base.replace(/\p{Cc}/gu, '').trim().slice(0, 120);
  return clean || `attachment.${ATTACHMENT_EXTENSION[kind]}`;
}

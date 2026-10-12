/**
 * What a library file may be. The type is read from the file's own leading bytes, never from the name or the `Content-Type`
 * the client declared, since both are whatever the sender typed.
 */
export type DocumentFileKind = 'pdf' | 'jpeg' | 'png';

export const DOCUMENT_FILE_MESSAGE = 'Upload a PDF, JPG or PNG.';

export function detectDocumentKind(file: Buffer): DocumentFileKind | null {
  if (file.subarray(0, 1024).includes('%PDF-')) return 'pdf';
  if (file.length >= 3 && file[0] === 0xff && file[1] === 0xd8 && file[2] === 0xff) return 'jpeg';
  if (file.length >= 8 && file.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  return null;
}

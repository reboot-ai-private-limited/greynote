/**
 * What an expense's proof may be. The type is read from the file's own leading bytes, never from the name or the `Content-Type` the client
 * declared, since both are whatever the sender typed.
 */
export type ProofFileKind = 'pdf' | 'jpeg' | 'png';

export const PROOF_FILE_MESSAGE = 'Upload a PDF, JPG or PNG.';
export const PROOF_MIME: Record<ProofFileKind, string> = { pdf: 'application/pdf', jpeg: 'image/jpeg', png: 'image/png' };

export function detectProofKind(file: Buffer): ProofFileKind | null {
  if (file.subarray(0, 1024).includes('%PDF-')) return 'pdf';
  if (file.length >= 3 && file[0] === 0xff && file[1] === 0xd8 && file[2] === 0xff) return 'jpeg';
  if (file.length >= 8 && file.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  return null;
}

/** A file name safe to show and store: no folders, no odd characters, at most 120 long. */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const cleaned = base.replace(/[^\p{L}\p{N}._ -]/gu, '').trim().slice(0, 120);
  return cleaned === '' ? 'proof' : cleaned;
}

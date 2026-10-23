/** What a profile photo may be. Read from the file's leading bytes, like `documentFile.ts`; no PDFs. */
export const PHOTO_FILE_MESSAGE = 'Upload a JPG, PNG or WebP photo.';

export function isPhotoFile(file: Buffer): boolean {
  if (file.length >= 3 && file[0] === 0xff && file[1] === 0xd8 && file[2] === 0xff) return true;
  if (file.length >= 8 && file.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return true;
  return file.length >= 12 && file.subarray(0, 4).toString('latin1') === 'RIFF' && file.subarray(8, 12).toString('latin1') === 'WEBP';
}

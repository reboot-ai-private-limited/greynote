/** The employee photo: what the form accepts before anything is uploaded. The API checks the real file type again. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const PHOTO_ACCEPT = '.jpg,.jpeg,.png,.webp';

const EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

export function photoError(file: { name: string; size: number }): string | undefined {
  if (file.size === 0) return 'That file is empty.';
  if (file.size > MAX_PHOTO_BYTES) return 'The photo is over 5 MB.';
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!EXTENSIONS.includes(extension)) return 'Use a JPG, PNG or WebP photo.';
  return undefined;
}

export function photoForm(file: File): FormData {
  const form = new FormData();
  form.append('file', file);
  return form;
}

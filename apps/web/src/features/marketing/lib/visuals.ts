import type { VisualCategory } from '@greynote/contracts';

/** What the upload form offers and what it refuses before anything is sent. The API enforces the 25 MB cap and the real type. */
export const MAX_VISUAL_BYTES = 25 * 1024 * 1024;
export const ACCEPTED_VISUAL_EXTENSIONS = [
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
] as const;
export const VISUAL_ACCEPT_ATTRIBUTE = ACCEPTED_VISUAL_EXTENSIONS.map((e) => `.${e}`).join(',');

const extensionOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';

export function visualFileError(file: { name: string; size: number }): string | undefined {
  if (file.size === 0) return 'That file is empty.';
  if (file.size > MAX_VISUAL_BYTES) return 'That file is over 25 MB.';
  if (!(ACCEPTED_VISUAL_EXTENSIONS as readonly string[]).includes(extensionOf(file.name)))
    return 'Use a PNG, JPG, WebP or GIF image.';
  return undefined;
}

export interface VisualDraft {
  title: string;
  category: VisualCategory | '';
  /** `''` = a general visual, not tied to a product. */
  productId: string;
  file: { name: string; size: number } | null;
}
export const EMPTY_VISUAL: VisualDraft = {
  title: '',
  category: 'E_DETAILING',
  productId: '',
  file: null,
};

/** Errors for the upload form; `needsFile` is false when editing, where the file cannot be replaced. */
export function visualErrors(draft: VisualDraft, needsFile: boolean): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!draft.title.trim()) errors['title'] = 'Give the visual a title.';
  else if (draft.title.trim().length > 200)
    errors['title'] = 'Keep the title under 200 characters.';
  if (!draft.category) errors['category'] = 'Choose a category.';
  if (needsFile) {
    if (!draft.file) errors['file'] = 'Choose a file.';
    else {
      const problem = visualFileError(draft.file);
      if (problem) errors['file'] = problem;
    }
  }
  return errors;
}

/** The multipart body the upload endpoint expects: text fields first, then the file under `file`. */
export function buildVisualForm(draft: VisualDraft, file: File): FormData {
  const form = new FormData();
  form.set('title', draft.title.trim());
  form.set('category', draft.category);
  if (draft.productId) form.set('productId', draft.productId);
  form.set('file', file);
  return form;
}

/** What the viewer can draw: an image; anything else is only openable in a new tab. */
export const visualPreviewKind = (mimeType: string): 'image' | 'other' =>
  mimeType.startsWith('image/') ? 'image' : 'other';

export function visualKind(mimeType: string): 'Image' | 'PDF' | 'Video' | 'File' {
  if (mimeType.startsWith('image/')) return 'Image';
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.startsWith('video/')) return 'Video';
  return 'File';
}

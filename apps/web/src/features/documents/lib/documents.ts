import type { CompanyDocumentCategory } from '@greynote/contracts';

export const CATEGORY_LABEL: Record<CompanyDocumentCategory, string> = {
  POLICY: 'Policy',
  CIRCULAR: 'Circular',
  FORM: 'Form',
  OTHER: 'Other',
};
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png';

export interface DocumentDraft {
  title: string;
  category: CompanyDocumentCategory | '';
  /** Empty means every field employee. */
  userIds: string[];
}

export const EMPTY_DOCUMENT: DocumentDraft = { title: '', category: '', userIds: [] };

/** What the form refuses before anything is sent. The API still checks the file's real type. */
export function documentErrors(
  draft: DocumentDraft,
  file: { name: string; size: number } | null,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!draft.title.trim()) errors['title'] = 'Give it a title.';
  if (!draft.category) errors['category'] = 'Pick a category.';
  if (!file) errors['file'] = 'Choose a file.';
  else if (file.size === 0) errors['file'] = 'That file is empty.';
  else if (file.size > MAX_DOCUMENT_BYTES) errors['file'] = 'That file is over 10 MB.';
  else if (!/\.(pdf|jpe?g|png)$/i.test(file.name)) errors['file'] = 'Use a PDF, JPG or PNG.';
  return errors;
}

export function buildDocumentForm(draft: DocumentDraft, file: File): FormData {
  const form = new FormData();
  form.append('title', draft.title.trim());
  form.append('category', draft.category);
  if (draft.userIds.length > 0) form.append('userIds', JSON.stringify(draft.userIds));
  form.append('file', file);
  return form;
}


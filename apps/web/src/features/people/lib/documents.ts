/**
 * Employee documents: what the form offers and what it refuses before anything is uploaded. The
 * API enforces only the 10 MB limit; the type and extension checks here keep a wrong file from
 * reaching storage.
 */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export const DOCUMENT_TYPES = [
  { value: 'AADHAAR', label: 'Aadhaar' },
  { value: 'PAN', label: 'PAN' },
  { value: 'CANCELLED_CHEQUE', label: 'Cancelled cheque' },
  { value: 'QUALIFICATION', label: 'Qualification certificate' },
  { value: 'OFFER_LETTER', label: 'Offer letter' },
  { value: 'OTHER', label: 'Other' },
] as const;

/** A readable name for a stored type; a type this list does not know is shown as stored. */
export function documentTypeLabel(type: string): string {
  return DOCUMENT_TYPES.find((t) => t.value === type)?.label ?? type;
}

/** How the viewer draws a stored file, from the extension Cloudinary keeps on its URL. */
export function fileKindOfUrl(url: string): 'image' | 'pdf' | 'other' {
  const path = url.split(/[?#]/)[0] ?? '';
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'pdf';
  if (['jpg', 'jpeg', 'png'].includes(ext)) return 'image';
  return 'other';
}

export const ACCEPTED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png'] as const;
export const ACCEPT_ATTRIBUTE = ACCEPTED_EXTENSIONS.map((e) => `.${e}`).join(',');

const extensionOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';

export function fileError(file: { name: string; size: number }): string | undefined {
  if (file.size === 0) return 'That file is empty.';
  if (file.size > MAX_DOCUMENT_BYTES) return 'That file is over 10 MB.';
  if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(extensionOf(file.name))) return 'Use a PDF, JPG or PNG.';
  return undefined;
}

export interface DocumentDraft {
  documentType: string;
  file: { name: string; size: number } | null;
}

export function documentErrors(draft: DocumentDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!DOCUMENT_TYPES.some((t) => t.value === draft.documentType)) errors['documentType'] = 'Choose a document type.';
  if (!draft.file) errors['file'] = 'Choose a file.';
  else {
    const problem = fileError(draft.file);
    if (problem) errors['file'] = problem;
  }
  return errors;
}

/** The multipart body the upload endpoint expects: the type, then the file under `file`. */
export function buildDocumentForm(documentType: string, file: File): FormData {
  const form = new FormData();
  // Text field first, then the file, as the API documents it.
  form.set('documentType', documentType);
  form.set('file', file);
  return form;
}

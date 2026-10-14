import { describe, expect, it } from 'vitest';
import {
  MAX_DOCUMENT_BYTES,
  buildDocumentForm,
  documentErrors,
  documentTypeLabel,
  fileError,
  fileKindOfUrl,
} from './documents';

describe('fileKindOfUrl', () => {
  it('reads the kind from the extension, ignoring a query string', () => {
    expect(fileKindOfUrl('https://x/a/b.pdf')).toBe('pdf');
    expect(fileKindOfUrl('https://x/a/b.JPG?v=1')).toBe('image');
    expect(fileKindOfUrl('https://x/a/b.png')).toBe('image');
    expect(fileKindOfUrl('https://x/a/b')).toBe('other');
  });
});

describe('fileError', () => {
  it('accepts a PDF, JPG, JPEG and PNG in any case', () => {
    for (const name of ['a.pdf', 'a.JPG', 'a.jpeg', 'scan.final.PNG']) {
      expect(fileError({ name, size: 1000 })).toBeUndefined();
    }
  });
  it('refuses other types, including an executable with a document-looking name', () => {
    expect(fileError({ name: 'a.exe', size: 10 })).toBe('Use a PDF, JPG or PNG.');
    expect(fileError({ name: 'a.pdf.exe', size: 10 })).toBe('Use a PDF, JPG or PNG.');
    expect(fileError({ name: 'noextension', size: 10 })).toBe('Use a PDF, JPG or PNG.');
  });
  it('refuses an empty file and one over 10 MB, and allows exactly 10 MB', () => {
    expect(fileError({ name: 'a.pdf', size: 0 })).toBe('That file is empty.');
    expect(fileError({ name: 'a.pdf', size: MAX_DOCUMENT_BYTES + 1 })).toBe('That file is over 10 MB.');
    expect(fileError({ name: 'a.pdf', size: MAX_DOCUMENT_BYTES })).toBeUndefined();
  });
});

describe('documentErrors', () => {
  it('needs a type and a file', () => {
    expect(Object.keys(documentErrors({ documentType: '', file: null })).sort()).toEqual(['documentType', 'file']);
  });
  it('is empty for a valid draft', () => {
    expect(documentErrors({ documentType: 'PAN', file: { name: 'pan.pdf', size: 500 } })).toEqual({});
  });
  it('refuses a type outside the list', () => {
    expect(documentErrors({ documentType: 'SELFIE', file: { name: 'a.png', size: 5 } })).toHaveProperty('documentType');
  });
});

describe('documentTypeLabel', () => {
  it('names a known type and shows an unknown one as stored', () => {
    expect(documentTypeLabel('CANCELLED_CHEQUE')).toBe('Cancelled cheque');
    expect(documentTypeLabel('Voter ID')).toBe('Voter ID');
  });
});

describe('buildDocumentForm', () => {
  it('puts the type before the file', () => {
    const form = buildDocumentForm('AADHAAR', new File(['x'], 'a.pdf', { type: 'application/pdf' }));
    expect([...form.keys()]).toEqual(['documentType', 'file']);
    expect(form.get('documentType')).toBe('AADHAAR');
    expect((form.get('file') as File).name).toBe('a.pdf');
  });
});

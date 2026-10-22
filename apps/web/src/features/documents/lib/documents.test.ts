import { describe, expect, it } from 'vitest';
import { buildDocumentForm, documentErrors } from './documents';

const draft = { title: ' Leave policy ', category: 'POLICY' as const, userIds: [] };

describe('documentErrors', () => {
  it('accepts a titled, categorised PDF', () => {
    expect(documentErrors(draft, { name: 'a.PDF', size: 100 })).toEqual({});
  });
  it('refuses a missing title, category and file, a huge file, and a wrong type', () => {
    expect(Object.keys(documentErrors({ title: ' ', category: '', userIds: [] }, null))).toEqual([
      'title',
      'category',
      'file',
    ]);
    expect(documentErrors(draft, { name: 'a.pdf', size: 11 * 1024 * 1024 })['file']).toMatch(
      /10 MB/,
    );
    expect(documentErrors(draft, { name: 'a.docx', size: 10 })['file']).toMatch(/PDF, JPG or PNG/);
  });
});

describe('buildDocumentForm', () => {
  it('sends the audience only when people are named', () => {
    const file = new File(['x'], 'a.pdf');
    expect(buildDocumentForm(draft, file).get('userIds')).toBeNull();
    expect(buildDocumentForm({ ...draft, userIds: ['u1'] }, file).get('userIds')).toBe('["u1"]');
    expect(buildDocumentForm(draft, file).get('title')).toBe('Leave policy');
  });
});

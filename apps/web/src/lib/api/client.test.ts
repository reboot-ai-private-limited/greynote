import { describe, expect, it } from 'vitest';
import { encodeBody } from './client';

describe('encodeBody', () => {
  it('sends no body and no content type when there is none', () => {
    expect(encodeBody(undefined)).toBeNull();
  });
  it('sends an object as JSON', () => {
    expect(encodeBody({ a: 1 })).toEqual({ contentType: 'application/json', payload: '{"a":1}' });
  });
  it('sends FormData untouched, with no content type, so the browser sets the multipart boundary', () => {
    const form = new FormData();
    form.set('documentType', 'PAN');
    const encoded = encodeBody(form);
    expect(encoded?.payload).toBe(form);
    expect(encoded).not.toHaveProperty('contentType');
  });
});

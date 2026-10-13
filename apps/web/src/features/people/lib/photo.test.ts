import { describe, expect, it } from 'vitest';
import { photoError } from './photo';

describe('photoError', () => {
  it('accepts a normal photo', () => {
    expect(photoError({ name: 'me.JPG', size: 200_000 })).toBeUndefined();
    expect(photoError({ name: 'me.webp', size: 5 * 1024 * 1024 })).toBeUndefined();
  });

  it('refuses a PDF, an empty file and a big one', () => {
    expect(photoError({ name: 'cv.pdf', size: 1000 })).toBe('Use a JPG, PNG or WebP photo.');
    expect(photoError({ name: 'me.png', size: 0 })).toBe('That file is empty.');
    expect(photoError({ name: 'me.png', size: 5 * 1024 * 1024 + 1 })).toBe('The photo is over 5 MB.');
  });
});

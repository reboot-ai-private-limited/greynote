import { describe, expect, it } from 'vitest';
import {
  EMPTY_VISUAL,
  buildVisualForm,
  visualErrors,
  visualFileError,
  visualKind,
} from './visuals';

describe('visual upload checks', () => {
  it('accepts images, PDFs and videos and refuses the rest', () => {
    expect(visualFileError({ name: 'a.PNG', size: 10 })).toBeUndefined();
    expect(visualFileError({ name: 'a.pdf', size: 10 })).toBeUndefined();
    expect(visualFileError({ name: 'a.mp4', size: 10 })).toBeUndefined();
    expect(visualFileError({ name: 'a.exe', size: 10 })).toMatch(/Use an image/);
    expect(visualFileError({ name: 'a.png', size: 0 })).toMatch(/empty/);
    expect(visualFileError({ name: 'a.png', size: 26 * 1024 * 1024 })).toMatch(/25 MB/);
  });

  it('needs a title and a file to upload, but only a title to edit', () => {
    expect(Object.keys(visualErrors(EMPTY_VISUAL, true)).sort()).toEqual(['file', 'title']);
    expect(Object.keys(visualErrors(EMPTY_VISUAL, false))).toEqual(['title']);
    expect(
      visualErrors({ ...EMPTY_VISUAL, title: 'Hero', file: { name: 'a.png', size: 5 } }, true),
    ).toEqual({});
  });

  it('puts the text fields before the file, and leaves the product out for a general visual', () => {
    const form = buildVisualForm(
      { ...EMPTY_VISUAL, title: ' Hero ', productId: '' },
      new File(['x'], 'a.png'),
    );
    expect([...form.keys()]).toEqual(['title', 'category', 'file']);
    expect(form.get('title')).toBe('Hero');
    expect([
      ...buildVisualForm(
        { ...EMPTY_VISUAL, title: 'x', productId: 'p1' },
        new File(['x'], 'a.png'),
      ).keys(),
    ]).toContain('productId');
  });

  it('names the kind of file', () => {
    expect(visualKind('image/png')).toBe('Image');
    expect(visualKind('application/pdf')).toBe('PDF');
    expect(visualKind('video/webm')).toBe('Video');
  });
});

import { describe, expect, it } from 'vitest';
import { downloadUrlOf } from './downloadUrl.js';

const image = 'https://res.cloudinary.com/demo/image/upload/v1712/greynote/inbox/abc.pdf';

describe('downloadUrlOf', () => {
  it('adds fl_attachment with a safe name to an image-type delivery', () => {
    expect(downloadUrlOf(image, 'Price list, Oct 2026.pdf')).toBe('https://res.cloudinary.com/demo/image/upload/fl_attachment:Price_list_Oct_2026/v1712/greynote/inbox/abc.pdf');
  });
  it('falls back to the bare flag when nothing of the name is usable', () => {
    expect(downloadUrlOf(image, 'दिवाली.pdf')).toBe('https://res.cloudinary.com/demo/image/upload/fl_attachment/v1712/greynote/inbox/abc.pdf');
  });
  it('leaves raw files and other hosts alone', () => {
    const raw = 'https://res.cloudinary.com/demo/raw/upload/v1712/greynote/inbox/abc.docx';
    expect(downloadUrlOf(raw, 'Form.docx')).toBe(raw);
    expect(downloadUrlOf('https://example.com/image/upload/x.png', 'x')).toBe('https://example.com/image/upload/x.png');
  });
});

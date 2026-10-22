import { describe, expect, it } from 'vitest';
import { cleanFileName, detectAttachmentKind, resourceTypeOf } from './attachment.js';

const zip = (...parts: string[]) => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(['[Content_Types].xml', ...parts].join('\0'), 'latin1')]);

describe('detectAttachmentKind', () => {
  it('reads PDFs, JPEG, PNG and WebP from their bytes', () => {
    expect(detectAttachmentKind(Buffer.from('%PDF-1.7 ...'))).toBe('pdf');
    expect(detectAttachmentKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(detectAttachmentKind(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('png');
    expect(detectAttachmentKind(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1'))).toBe('webp');
  });
  it('tells Word, Excel and PowerPoint apart by their parts', () => {
    expect(detectAttachmentKind(zip('word/document.xml'))).toBe('docx');
    expect(detectAttachmentKind(zip('xl/workbook.xml'))).toBe('xlsx');
    expect(detectAttachmentKind(zip('ppt/presentation.xml'))).toBe('pptx');
  });
  it('refuses anything else: a plain ZIP, text, an old .doc', () => {
    expect(detectAttachmentKind(Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('photos/a.jpg')]))).toBeNull();
    expect(detectAttachmentKind(Buffer.from('hello'))).toBeNull();
    expect(detectAttachmentKind(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).toBeNull();
  });
  it('stores Office files raw and the rest as images', () => {
    expect(resourceTypeOf('docx')).toBe('raw');
    expect(resourceTypeOf('pdf')).toBe('image');
  });
});

describe('cleanFileName', () => {
  it('keeps the name, decoding the UTF-8 multer reads as latin1, without folders', () => {
    expect(cleanFileName('C:\\Users\\a\\Price list.pdf', 'pdf')).toBe('Price list.pdf');
    expect(cleanFileName(Buffer.from('दिवाली.pdf', 'utf8').toString('latin1'), 'pdf')).toBe('दिवाली.pdf');
  });
  it('names a nameless file by its kind', () => {
    expect(cleanFileName('  ', 'xlsx')).toBe('attachment.xlsx');
  });
});

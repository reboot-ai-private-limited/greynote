import { describe, expect, it } from 'vitest';
import { detectDocumentKind } from './documentFile.js';

const bytes = (...b: number[]) => Buffer.from(b);

describe('detectDocumentKind', () => {
  it('recognises a PDF, a JPEG and a PNG by their headers', () => {
    expect(detectDocumentKind(Buffer.from('%PDF-1.7\n...'))).toBe('pdf');
    expect(detectDocumentKind(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10))).toBe('jpeg');
    expect(detectDocumentKind(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe('png');
  });
  it('finds a PDF header a few bytes in, as readers do', () => {
    expect(detectDocumentKind(Buffer.from('\n\n  %PDF-1.4'))).toBe('pdf');
  });
  it('refuses an executable, a script, a zip and a GIF, whatever they are called', () => {
    expect(detectDocumentKind(Buffer.from('MZ\x90\x00'))).toBeNull(); // Windows executable
    expect(detectDocumentKind(Buffer.from('#!/bin/sh\necho hi'))).toBeNull();
    expect(detectDocumentKind(Buffer.from('PK\x03\x04'))).toBeNull(); // zip, docx
    expect(detectDocumentKind(Buffer.from('GIF89a'))).toBeNull();
  });
  it('refuses an empty file and a truncated header', () => {
    expect(detectDocumentKind(Buffer.alloc(0))).toBeNull();
    expect(detectDocumentKind(bytes(0xff, 0xd8))).toBeNull();
    expect(detectDocumentKind(bytes(0x89, 0x50, 0x4e, 0x47))).toBeNull();
  });
  it('does not accept a PDF header buried deep inside another file', () => {
    expect(detectDocumentKind(Buffer.concat([Buffer.alloc(2000), Buffer.from('%PDF-1.4')]))).toBeNull();
  });
});

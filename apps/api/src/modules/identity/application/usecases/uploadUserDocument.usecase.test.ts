import { describe, expect, it } from 'vitest';
import type { EmployeeProfile } from '../../domain/employeeProfile.entity.js';
import { UploadUserDocumentUseCase } from './uploadUserDocument.usecase.js';

function build(userExists = true) {
  const uploads: Buffer[] = [];
  const upserts: Array<Partial<EmployeeProfile>> = [];
  const useCase = new UploadUserDocumentUseCase(
    { findById: async () => (userExists ? { id: 'u1' } : null) } as never,
    {
      findByUserId: async () => null,
      upsert: async (_id: string, input: Partial<EmployeeProfile>) => {
        upserts.push(input);
        return {} as EmployeeProfile;
      },
    } as never,
    {
      upload: async (buffer: Buffer) => {
        uploads.push(buffer);
        return { url: 'https://cdn.example/doc.pdf', publicId: 'greynote/users/u1/documents/doc' };
      },
    } as never,
  );
  return { useCase, uploads, upserts };
}

const PDF = Buffer.from('%PDF-1.7\nbody');
const EXE = Buffer.from('MZ\x90\x00\x03');

describe('UploadUserDocumentUseCase', () => {
  it('stores a PDF and attaches it to the profile', async () => {
    const { useCase, uploads, upserts } = build();
    const document = await useCase.execute('u1', 'AADHAAR', PDF, 'application/pdf');
    expect(document).toMatchObject({ type: 'AADHAAR', url: 'https://cdn.example/doc.pdf' });
    expect(uploads).toEqual([PDF]);
    expect(upserts).toHaveLength(1);
  });

  it('refuses an executable before it reaches storage, even if it claims to be a PDF', async () => {
    const { useCase, uploads, upserts } = build();
    await expect(useCase.execute('u1', 'AADHAAR', EXE, 'application/pdf')).rejects.toMatchObject({
      statusCode: 400,
      message: 'Upload a PDF, JPG or PNG.',
    });
    expect(uploads).toEqual([]);
    expect(upserts).toEqual([]);
  });

  it('accepts a real PDF that declares the wrong type', async () => {
    const { useCase } = build();
    await expect(useCase.execute('u1', 'PAN', PDF, 'application/octet-stream')).resolves.toBeDefined();
  });

  it('refuses an empty file', async () => {
    const { useCase, uploads } = build();
    await expect(useCase.execute('u1', 'PAN', Buffer.alloc(0), 'application/pdf')).rejects.toMatchObject({ statusCode: 400 });
    expect(uploads).toEqual([]);
  });

  it('still reports an unknown employee as not found, before looking at the file', async () => {
    const { useCase } = build(false);
    await expect(useCase.execute('ghost', 'PAN', EXE, 'x')).rejects.toMatchObject({ statusCode: 404 });
  });
});

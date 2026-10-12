import { describe, expect, it } from 'vitest';
import type { CompanyDocument } from '../../domain/companyDocument.entity.js';
import type { CompanyDocumentRepositoryPort } from '../../domain/documents.repository.port.js';
import { DeleteDocumentUseCase, ListDocumentsUseCase, UploadDocumentUseCase } from './documents.usecase.js';

const PDF = Buffer.from('%PDF-1.4 hello');

function build() {
  const rows: CompanyDocument[] = [];
  const removed: string[] = [];
  const repo: CompanyDocumentRepositoryPort = {
    create: async (i) => {
      const d = { ...i, id: `d${rows.length + 1}`, uploadedAt: new Date(2026, 9, rows.length + 1) };
      rows.push(d);
      return d;
    },
    findById: async (id) => rows.find((r) => r.id === id) ?? null,
    listAll: async () => [...rows].reverse(),
    listVisibleTo: async (u) => [...rows].reverse().filter((r) => r.everyone || r.userIds.includes(u)),
    delete: async (id) => rows.splice(0, rows.length, ...rows.filter((r) => r.id !== id)) !== undefined,
  };
  const storage = { upload: async () => ({ url: 'https://f/x.pdf', publicId: 'p1' }), remove: async (id: string) => void removed.push(id) };
  const directory = { listActiveRecipients: async () => [{ id: 'mr1', role: 'FIELD' }, { id: 'mr2', role: 'FIELD' }, { id: 'hr1', role: 'HR' }] };
  return { rows, removed, upload: new UploadDocumentUseCase(repo, storage, directory), list: new ListDocumentsUseCase(repo), remove: new DeleteDocumentUseCase(repo, storage) };
}

describe('company documents', () => {
  it('is for everyone when no one is named, and each employee sees only theirs', async () => {
    const t = build();
    await t.upload.execute('admin', { title: 'Policy', category: 'POLICY', userIds: [], file: PDF });
    await t.upload.execute('admin', { title: 'Offer', category: 'OTHER', userIds: ['mr1'], file: PDF });
    expect((await t.list.execute({ id: 'mr1', role: 'FIELD' })).map((d) => d.title)).toEqual(['Offer', 'Policy']);
    const mr2 = await t.list.execute({ id: 'mr2', role: 'FIELD' });
    expect(mr2.map((d) => d.title)).toEqual(['Policy']);
    expect(mr2[0]).not.toHaveProperty('userIds');
    expect((await t.list.execute({ id: 'admin', role: 'ADMIN' }))[0]).toMatchObject({ title: 'Offer', userIds: ['mr1'], everyone: false });
  });

  it('refuses a file that is not a PDF, JPG or PNG, and people who are not active field employees', async () => {
    const t = build();
    await expect(t.upload.execute('admin', { title: 'x', category: 'FORM', userIds: [], file: Buffer.from('MZ exe') })).rejects.toMatchObject({ publicDetails: { code: 'UNSUPPORTED_FILE' } });
    await expect(t.upload.execute('admin', { title: 'x', category: 'FORM', userIds: ['hr1'], file: PDF })).rejects.toMatchObject({ publicDetails: { field: 'userIds' } });
    expect(t.rows).toEqual([]);
  });

  it('removes the file with the row', async () => {
    const t = build();
    await t.upload.execute('admin', { title: 'Policy', category: 'POLICY', userIds: [], file: PDF });
    await t.remove.execute('d1');
    expect(t.removed).toEqual(['p1']);
    expect(t.rows).toEqual([]);
    await expect(t.remove.execute('d1')).rejects.toMatchObject({ statusCode: 404 });
  });
});

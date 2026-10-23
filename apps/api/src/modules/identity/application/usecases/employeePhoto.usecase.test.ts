import { describe, expect, it } from 'vitest';
import type { PhotoStoragePort } from '@/shared/storage/photoStorage.port.js';
import { RemoveDraftPhotoUseCase, RemoveEmployeePhotoUseCase, SetDraftPhotoUseCase, SetEmployeePhotoUseCase } from './employeePhoto.usecase.js';
import { DeleteEmployeeDraftUseCase, toDraftView } from './employeeDrafts.usecase.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const PDF = Buffer.from('%PDF-1.4');

function storage() {
  const removed: string[] = [];
  let n = 0;
  let failUpload = false;
  const port: PhotoStoragePort = {
    upload: async (_f, folder) => {
      if (failUpload) throw new Error('down');
      n += 1;
      return { url: `https://img/${n}.jpg`, publicId: `greynote/${folder}/photo/${n}` };
    },
    remove: async (id) => { removed.push(id); },
  };
  return { port, removed, failUploads: () => { failUpload = true; } };
}

function profiles(initial: { photo?: { url: string; publicId: string } | null } | null = null) {
  let row = initial;
  let failSave = false;
  return {
    repo: {
      findByUserId: async () => row,
      upsert: async (_id: string, patch: object) => {
        if (failSave) throw new Error('db down');
        row = { ...row, ...patch };
        return row;
      },
    } as never,
    row: () => row,
    failSaves: () => { failSave = true; },
  };
}

const users = { findById: async (id: string) => (id === 'u1' ? { id } : null) } as never;

describe('employee photo', () => {
  it('stores a first photo and returns only its address', async () => {
    const s = storage();
    const p = profiles();
    const result = await new SetEmployeePhotoUseCase(users, p.repo, s.port).execute('u1', JPEG);
    expect(result).toEqual({ photoUrl: 'https://img/1.jpg' });
    expect(s.removed).toEqual([]);
  });

  it('deletes the old file from storage when the photo is replaced', async () => {
    const s = storage();
    const p = profiles({ photo: { url: 'https://img/old.jpg', publicId: 'old-id' } });
    await new SetEmployeePhotoUseCase(users, p.repo, s.port).execute('u1', JPEG);
    expect(s.removed).toEqual(['old-id']);
    expect((p.row() as { photo: { url: string } }).photo.url).toBe('https://img/1.jpg');
  });

  it('refuses a PDF before anything is stored', async () => {
    const s = storage();
    await expect(new SetEmployeePhotoUseCase(users, profiles().repo, s.port).execute('u1', PDF)).rejects.toThrow(/JPG, PNG or WebP/);
    expect(s.removed).toEqual([]);
  });

  it('deletes the new file when saving fails, keeping the old one', async () => {
    const s = storage();
    const p = profiles({ photo: { url: 'u', publicId: 'old-id' } });
    p.failSaves();
    await expect(new SetEmployeePhotoUseCase(users, p.repo, s.port).execute('u1', JPEG)).rejects.toThrow('db down');
    expect(s.removed).toEqual(['greynote/users/u1/photo/1']);
  });

  it('removes the file from storage, then clears the record', async () => {
    const s = storage();
    const p = profiles({ photo: { url: 'u', publicId: 'old-id' } });
    expect(await new RemoveEmployeePhotoUseCase(p.repo, s.port).execute('u1')).toEqual({ photoUrl: null });
    expect(s.removed).toEqual(['old-id']);
    expect((p.row() as { photo: null }).photo).toBeNull();
  });
});

describe('draft photo', () => {
  function drafts(data: Record<string, unknown> = {}) {
    let draft: { id: string; data: Record<string, unknown>; createdUserId: string | null } | null = { id: 'd1', data, createdUserId: null };
    return {
      repo: {
        findById: async () => draft,
        update: async (_id: string, patch: { data: Record<string, unknown> }) => { draft = { ...draft!, data: patch.data }; return draft; },
        delete: async () => { draft = null; },
      } as never,
      now: () => draft,
    };
  }

  it('saves the photo in its own section and replaces the old file', async () => {
    const s = storage();
    const d = drafts({ photo: { url: 'u', publicId: 'old' }, personal: { name: 'A' } });
    await new SetDraftPhotoUseCase(d.repo, s.port).execute('d1', JPEG);
    expect(s.removed).toEqual(['old']);
    expect(d.now()?.data).toMatchObject({ personal: { name: 'A' }, photo: { url: 'https://img/1.jpg' } });
  });

  it('removes the photo from storage and the draft', async () => {
    const s = storage();
    const d = drafts({ photo: { url: 'u', publicId: 'old' }, personal: { name: 'A' } });
    await new RemoveDraftPhotoUseCase(d.repo, s.port).execute('d1');
    expect(s.removed).toEqual(['old']);
    expect(d.now()?.data).toEqual({ personal: { name: 'A' } });
  });

  it('deleting the draft deletes its photo', async () => {
    const s = storage();
    const d = drafts({ photo: { url: 'u', publicId: 'old' } });
    await new DeleteEmployeeDraftUseCase(d.repo, s.port).execute('d1');
    expect(s.removed).toEqual(['old']);
    expect(d.now()).toBeNull();
  });

  it('never shows the storage id of a draft photo', () => {
    const view = toDraftView({ id: 'd1', createdBy: 'a', step: 1, createdUserId: null, createdAt: new Date(), updatedAt: new Date(), data: { photo: { url: 'u', publicId: 'secret' } } });
    expect(JSON.stringify(view)).not.toContain('secret');
    expect(view.data.photoUrl).toBe('u');
  });
});

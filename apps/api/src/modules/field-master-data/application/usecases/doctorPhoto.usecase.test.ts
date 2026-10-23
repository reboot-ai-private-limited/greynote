import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import type { PhotoStoragePort } from '@/shared/storage/photoStorage.port.js';
import { NEW_DOCTOR_KIND } from '../doctorApproval.js';
import { RemoveDoctorPhotoUseCase, SetDoctorPhotoUseCase } from './doctorPhoto.usecase.js';
import { FakeApprovals, FakeAssignments, FakeDoctors } from './fmdTestKit.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const PDF = Buffer.from('%PDF-1.4');
const admin = { id: 'admin', role: 'ADMIN' as const };
const mr = { id: 'mr1', role: 'FIELD' as const };

async function expectStatus(promise: Promise<unknown>, statusCode: number) {
  const err = await promise.then(() => undefined, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).statusCode).toBe(statusCode);
}

describe('A doctor’s photo', () => {
  let doctors: FakeDoctors;
  let approvals: FakeApprovals;
  let removed: string[];
  let failUpload: boolean;
  let set: SetDoctorPhotoUseCase;
  let remove: RemoveDoctorPhotoUseCase;
  let n: number;

  const storage: PhotoStoragePort = {
    upload: async (_f, folder) => {
      if (failUpload) throw new Error('down');
      n += 1;
      return { url: `https://img/${n}.jpg`, publicId: `greynote/${folder}/photo/${n}` };
    },
    remove: async (id) => { removed.push(id); },
  };

  /** An MR-added doctor with its request, or an Admin-added one (no request). */
  async function seed(over: { addedBy?: string; clientRequestId?: string | null; photo?: { url: string; publicId: string } | null } = {}) {
    const d = await doctors.create({
      routeId: 'route-1', name: 'Dr Mehta', address: 'x', email: null, specialty: 'ENT', qualification: 'MS',
      clinicName: null, phone: null, photo: over.photo ?? null, dateOfBirth: null, anniversary: null, visitFrequency: null,
      location: null, capturedLocation: null, status: 'pending', addedBy: over.addedBy ?? 'mr1',
      clientRequestId: over.clientRequestId === undefined ? 'c1' : over.clientRequestId, approvedAt: null,
    });
    if ((over.clientRequestId === undefined ? 'c1' : over.clientRequestId) !== null) await approvals.submit({ kind: NEW_DOCTOR_KIND, recordId: d.id, submitterId: d.addedBy });
    return d;
  }

  beforeEach(() => {
    doctors = new FakeDoctors(new FakeAssignments());
    approvals = new FakeApprovals();
    approvals.registerKind({ kind: NEW_DOCTOR_KIND, finalApproverRoles: ['ADMIN'], describeRecords: async () => new Map() });
    removed = [];
    failUpload = false;
    n = 0;
    set = new SetDoctorPhotoUseCase(doctors, approvals, storage);
    remove = new RemoveDoctorPhotoUseCase(doctors, approvals, storage);
  });

  it('Admin sets it, and the view carries only the address', async () => {
    const d = await seed({ clientRequestId: null, addedBy: 'admin' });
    expect(await set.execute(admin, d.id, JPEG)).toEqual({ photoUrl: 'https://img/1.jpg' });
    expect((await doctors.findById(d.id))!.photo).toEqual({ url: 'https://img/1.jpg', publicId: `greynote/doctors/${d.id}/photo/1` });
  });

  it('replacing it deletes the old file', async () => {
    const d = await seed({ photo: { url: 'https://img/old.jpg', publicId: 'old-id' } });
    await set.execute(admin, d.id, JPEG);
    expect(removed).toEqual(['old-id']);
  });

  it('refuses a file that is not a JPG, PNG or WebP, and uploads nothing', async () => {
    const d = await seed();
    await expectStatus(set.execute(admin, d.id, PDF), 400);
    expect(n).toBe(0);
  });

  it('a failed save deletes the file it just stored, and keeps the old one', async () => {
    const d = await seed({ photo: { url: 'u', publicId: 'old-id' } });
    doctors.update = async () => { throw new Error('db down'); };
    await expect(set.execute(admin, d.id, JPEG)).rejects.toThrow('db down');
    expect(removed).toEqual([`greynote/doctors/${d.id}/photo/1`]);
  });

  it('removing it deletes the file and clears the record; with none it does nothing', async () => {
    const d = await seed({ photo: { url: 'u', publicId: 'old-id' } });
    expect(await remove.execute(admin, d.id)).toEqual({ photoUrl: null });
    expect(removed).toEqual(['old-id']);
    expect((await doctors.findById(d.id))!.photo).toBeNull();
    await remove.execute(admin, d.id);
    expect(removed).toEqual(['old-id']);
  });

  it('a doctor that does not exist is a 404', async () => {
    await expectStatus(set.execute(admin, 'nope', JPEG), 404);
  });

  describe('the MR who added the doctor', () => {
    it('can set and remove it while the request is waiting', async () => {
      const d = await seed();
      expect(await set.execute(mr, d.id, JPEG)).toEqual({ photoUrl: 'https://img/1.jpg' });
      expect(await remove.execute(mr, d.id)).toEqual({ photoUrl: null });
    });

    it('can still change it after a rejection, without resubmitting', async () => {
      const d = await seed();
      await approvals.decide(NEW_DOCTOR_KIND, d.id, 'REJECTED');
      await set.execute(mr, d.id, JPEG);
      expect((await approvals.getForRecord(NEW_DOCTOR_KIND, d.id))!.status).toBe('REJECTED');
    });

    it('can’t once it is approved (409)', async () => {
      const d = await seed();
      await approvals.decide(NEW_DOCTOR_KIND, d.id, 'APPROVED');
      await expectStatus(set.execute(mr, d.id, JPEG), 409);
      await expectStatus(remove.execute(mr, d.id), 409);
    });

    it('can’t touch another MR’s doctor or one Admin added (404)', async () => {
      const other = await seed({ addedBy: 'mr2', clientRequestId: 'c2' });
      const byAdmin = await seed({ addedBy: 'admin', clientRequestId: null });
      await expectStatus(set.execute(mr, other.id, JPEG), 404);
      await expectStatus(set.execute(mr, byAdmin.id, JPEG), 404);
    });
  });
});

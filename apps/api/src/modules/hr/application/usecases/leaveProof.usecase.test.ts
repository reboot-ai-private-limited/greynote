import { beforeEach, describe, expect, it } from 'vitest';
import type { AppError } from '@/shared/errors/AppError.js';
import { DEFAULT_LEAVE_TYPES } from '../../domain/leaveType.entity.js';
import type { ProofStoragePort } from '../../domain/proofStorage.port.js';
import { LeaveProof } from '../leaveProof.js';
import { FakeApprovals, FakeLeaves, FakeLeaveTypes } from './hrTestKit.js';
import { LeaveViews } from '../leaveViews.js';

class FakeStorage implements ProofStoragePort {
  stored = new Map<string, Buffer>();
  removed: string[] = [];
  private n = 0;
  async upload(file: Buffer, meta: { userId: string; leaveId: string }) {
    const publicId = `proof/${meta.userId}/${meta.leaveId}/${++this.n}`;
    this.stored.set(publicId, file);
    return { url: `https://files.test/${publicId}`, publicId };
  }
  async remove(publicId: string) {
    this.stored.delete(publicId);
    this.removed.push(publicId);
  }
}

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('rest')]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
const status = (p: Promise<unknown>) => p.then(() => 0, (e: unknown) => (e as AppError).statusCode);

describe('proof on a leave (decision-log 2026-10-06)', () => {
  let leaves: FakeLeaves;
  let types: FakeLeaveTypes;
  let storage: FakeStorage;
  let proof: LeaveProof;
  let sickLeave: string;
  let casualLeave: string;

  beforeEach(async () => {
    types = new FakeLeaveTypes();
    await types.seed(DEFAULT_LEAVE_TYPES);
    leaves = new FakeLeaves();
    storage = new FakeStorage();
    proof = new LeaveProof(leaves, types, storage);
    const body = (leaveTypeId: string) => ({ leaveTypeId, isPaid: true, year: 2026, startDate: '2026-10-05', endDate: '2026-10-06', half: null, reason: 'unwell', days: [], daysCount: 2, ledgerDays: 2 });
    const idOf = (name: string) => types.rows.find((t) => t.name === name)!.id;
    sickLeave = (await leaves.create('mr', body(idOf('Sick')))).id;
    casualLeave = (await leaves.create('mr', body(idOf('Casual')))).id;
  });

  it('attaches a file to a leave of a type that takes proof; the type is read from the bytes, not the name', async () => {
    const files = await proof.add('mr', sickLeave, { buffer: PNG, name: 'prescription.pdf' });
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ fileName: 'prescription.pdf', mimeType: 'image/png', sizeBytes: PNG.length });
    expect('publicId' in files[0]!).toBe(false); // the storage id never reaches a client
    expect(storage.stored.size).toBe(1);
  });

  it('takes a PDF, a JPG and a PNG, and refuses anything else', async () => {
    for (const buffer of [PDF, JPEG, PNG]) await proof.add('mr', sickLeave, { buffer, name: 'x' });
    expect(await status(proof.add('mr', casualLeave, { buffer: PDF, name: 'x' }))).toBe(400);
    const second = await leaves.create('mr', { ...(await leaves.findById(sickLeave))! });
    expect(await status(proof.add('mr', second.id, { buffer: Buffer.from('just text'), name: 'x.pdf' }))).toBe(400);
    expect(await status(proof.add('mr', second.id, { buffer: Buffer.alloc(0), name: 'x.pdf' }))).toBe(400);
  });

  it('refuses a leave type that takes no proof, with nothing stored', async () => {
    expect(await status(proof.add('mr', casualLeave, { buffer: PDF, name: 'x.pdf' }))).toBe(400);
    expect(storage.stored.size).toBe(0);
  });

  it('refuses a file over 5 MB', async () => {
    expect(await status(proof.add('mr', sickLeave, { buffer: Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]), name: 'big.pdf' }))).toBe(400);
    expect(storage.stored.size).toBe(0);
  });

  it('takes at most 3 files, and a refused fourth leaves nothing behind in storage', async () => {
    for (let i = 0; i < 3; i += 1) await proof.add('mr', sickLeave, { buffer: PDF, name: `p${i}.pdf` });
    expect(await status(proof.add('mr', sickLeave, { buffer: PDF, name: 'p4.pdf' }))).toBe(409);
    expect(storage.stored.size).toBe(3);
  });

  it('a fourth that slips past the first check (a second request racing) is refused and its upload is removed', async () => {
    for (let i = 0; i < 3; i += 1) await proof.add('mr', sickLeave, { buffer: PDF, name: `p${i}.pdf` });
    // Make the early count look short, as it would for a request that read the leave just before the third file landed.
    const real = leaves.findById.bind(leaves);
    leaves.findById = async (id: string) => ({ ...(await real(id))!, attachments: [] });
    expect(await status(proof.add('mr', sickLeave, { buffer: PDF, name: 'late.pdf' }))).toBe(409);
    expect(storage.stored.size).toBe(3);
    expect(storage.removed).toHaveLength(1);
  });

  it('only the employee adds or removes proof; anyone else gets a 404', async () => {
    const [a] = await proof.add('mr', sickLeave, { buffer: PDF, name: 'x.pdf' });
    expect(await status(proof.add('other', sickLeave, { buffer: PDF, name: 'x.pdf' }))).toBe(404);
    expect(await status(proof.remove('other', sickLeave, a!.id))).toBe(404);
  });

  it('removing a file takes it off the leave and out of storage; an unknown file is a 404', async () => {
    const [a] = await proof.add('mr', sickLeave, { buffer: PDF, name: 'x.pdf' });
    await proof.add('mr', sickLeave, { buffer: PNG, name: 'y.png' });
    const left = await proof.remove('mr', sickLeave, a!.id);
    expect(left.map((f) => f.fileName)).toEqual(['y.png']);
    expect(storage.stored.size).toBe(1);
    expect(await status(proof.remove('mr', sickLeave, a!.id))).toBe(404);
  });

  it('cleans up the file name: no folders, no odd characters, never empty', async () => {
    const files = await proof.add('mr', sickLeave, { buffer: PDF, name: '../../etc/pass<wd>.pdf' });
    expect(files[0]!.fileName).toBe('passwd.pdf');
    const more = await proof.add('mr', sickLeave, { buffer: PDF, name: '***' });
    expect(more[1]!.fileName).toBe('proof');
  });

  it('is shown with the leave: the files without their storage ids, and whether the type takes proof', async () => {
    await proof.add('mr', sickLeave, { buffer: PDF, name: 'x.pdf' });
    const views = new LeaveViews(new FakeApprovals(), types);
    const view = await views.one((await leaves.findById(sickLeave))!);
    expect(view.allowsProof).toBe(true);
    expect(view.attachments).toHaveLength(1);
    expect('publicId' in view.attachments[0]!).toBe(false);
    expect((await views.one((await leaves.findById(casualLeave))!)).allowsProof).toBe(false);
  });
});

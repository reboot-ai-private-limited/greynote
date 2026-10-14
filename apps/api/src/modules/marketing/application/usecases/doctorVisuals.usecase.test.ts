import { beforeEach, describe, expect, it } from 'vitest';
import type { DoctorVisual, Visual } from '../../domain/marketing.entities.js';
import type { DoctorVisualRepositoryPort, VisualRepositoryPort } from '../../domain/marketing.repository.ports.js';
import { MARKETING_CODES, MarketingRefusal } from '../../domain/marketingRefusal.js';
import type { DirectoryUser, DoctorPort, UserDirectoryPort } from '../../domain/ports.js';
import { AddDoctorVisualsUseCase, ListDoctorVisualsUseCase, RemoveDoctorVisualUseCase } from './doctorVisuals.usecase.js';

const visual = (id: string, status: Visual['status'] = 'active'): Visual => ({ id, productId: null, title: id, category: 'E_DETAILING', fileUrl: `https://files/${id}`, publicId: id, mimeType: 'image/png', uploadedBy: 'admin', status, createdAt: new Date('2026-10-01') });

class FakeVisuals implements Pick<VisualRepositoryPort, 'findByIds'> {
  rows = [visual('v1'), visual('v2'), visual('vOff', 'inactive')];
  async findByIds(ids: string[]) {
    return this.rows.filter((v) => ids.includes(v.id));
  }
}
class FakeDoctorVisuals implements DoctorVisualRepositoryPort {
  rows: DoctorVisual[] = [];
  async listActive(doctorId: string) {
    return this.rows.filter((r) => r.doctorId === doctorId && !r.removedAt);
  }
  async addMany(doctorId: string, visualIds: string[], by: string, at: Date) {
    for (const visualId of visualIds) {
      const row = this.rows.find((r) => r.doctorId === doctorId && r.visualId === visualId);
      if (!row) this.rows.push({ id: `dv${this.rows.length + 1}`, doctorId, visualId, addedBy: by, addedAt: at, removedBy: null, removedAt: null });
      else if (row.removedAt) Object.assign(row, { addedBy: by, addedAt: at, removedBy: null, removedAt: null });
    }
  }
  async remove(doctorId: string, visualId: string, by: string, at: Date) {
    const row = this.rows.find((r) => r.doctorId === doctorId && r.visualId === visualId && !r.removedAt);
    if (!row) return false;
    Object.assign(row, { removedBy: by, removedAt: at });
    return true;
  }
}

// asm manages mr1; mr2 is a peer with no team; mr3 stands alone. doc1 is mr1's.
const tree: Record<string, string | null> = { asm: null, mr1: 'asm', mr2: 'asm', mr3: null };
const person = (id: string): DirectoryUser => ({ id, name: id, role: id === 'admin' ? 'ADMIN' : 'FIELD', status: 'active' });
const users: UserDirectoryPort = {
  async findUserSummary(id) {
    return id === 'admin' || id in tree ? person(id) : null;
  },
  async getDownline(m) {
    const below = (id: string): string[] => Object.keys(tree).filter((c) => tree[c] === id).flatMap((c) => [c, ...below(c)]);
    return below(m).map(person);
  },
  async getDesignationLevels(ids) {
    return ids.filter((id) => id in tree).map((userId) => ({ userId, level: userId === 'asm' ? 2 : 1 }));
  },
};
const doctors: DoctorPort = {
  async getDoctor(id) {
    return id === 'doc1' ? { id } : null;
  },
  async isAssignedToDoctor(userId, doctorId) {
    return doctorId === 'doc1' && userId === 'mr1';
  },
  async getAssignedUserId(doctorId) {
    return doctorId === 'doc1' ? 'mr1' : null;
  },
};
const admin = { id: 'admin', role: 'ADMIN' };
const f = (id: string) => ({ id, role: 'FIELD' });
const code = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (e instanceof MarketingRefusal ? e.code : 'OTHER'));

describe('doctor visuals', () => {
  let visuals: FakeVisuals;
  let store: FakeDoctorVisuals;
  let add: AddDoctorVisualsUseCase;
  let list: ListDoctorVisualsUseCase;
  let remove: RemoveDoctorVisualUseCase;

  beforeEach(() => {
    visuals = new FakeVisuals();
    store = new FakeDoctorVisuals();
    add = new AddDoctorVisualsUseCase(store, visuals as unknown as VisualRepositoryPort, doctors, users);
    list = new ListDoctorVisualsUseCase(store, visuals as unknown as VisualRepositoryPort, doctors, users);
    remove = new RemoveDoctorVisualUseCase(store, doctors, users);
  });

  it('the doctor’s MR adds visuals and sees them back, without the right to remove', async () => {
    await add.execute(f('mr1'), 'doc1', ['v1', 'v2']);
    const res = await list.execute(f('mr1'), 'doc1');
    expect(res.items.map((i) => i.visual.id)).toEqual(['v1', 'v2']);
    expect(res.items[0]).toMatchObject({ addedBy: 'mr1', addedByName: 'mr1' });
    expect(res.canRemove).toBe(false);
  });

  it('adding the same visual again keeps one row and the first adder', async () => {
    await add.execute(f('mr1'), 'doc1', ['v1']);
    await add.execute(admin, 'doc1', ['v1', 'v1']);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({ addedBy: 'mr1' });
  });

  it('the MR cannot remove a visual', async () => {
    await add.execute(f('mr1'), 'doc1', ['v1']);
    expect(await code(remove.execute(f('mr1'), 'doc1', 'v1'))).toBe(MARKETING_CODES.onlyManagerRemoves);
    expect(await store.listActive('doc1')).toHaveLength(1);
  });

  it('a manager above the MR and Admin can remove; the removed visual can be added back', async () => {
    await add.execute(f('mr1'), 'doc1', ['v1', 'v2']);
    await remove.execute(f('asm'), 'doc1', 'v1');
    await remove.execute(admin, 'doc1', 'v2');
    expect((await list.execute(admin, 'doc1')).items).toHaveLength(0);
    await add.execute(f('mr1'), 'doc1', ['v1']);
    expect((await list.execute(f('mr1'), 'doc1')).items.map((i) => i.visual.id)).toEqual(['v1']);
  });

  it('removing something not on the list is refused', async () => {
    expect(await code(remove.execute(admin, 'doc1', 'v1'))).toBe(MARKETING_CODES.doctorVisualNotFound);
  });

  it('a manager outside the chain, a peer MR and an unknown doctor are refused', async () => {
    expect(await code(list.execute(f('mr3'), 'doc1'))).toBe(MARKETING_CODES.notYourTeam);
    expect(await code(add.execute(f('mr2'), 'doc1', ['v1']))).toBe(MARKETING_CODES.notYourTeam);
    expect(await code(remove.execute(f('mr2'), 'doc1', 'v1'))).toBe(MARKETING_CODES.notYourTeam);
    expect(await code(list.execute(admin, 'nobody'))).toBe(MARKETING_CODES.doctorNotFound);
  });

  it('an inactive or unknown visual cannot be added', async () => {
    expect(await code(add.execute(f('mr1'), 'doc1', ['vOff']))).toBe(MARKETING_CODES.visualNotFound);
    expect(await code(add.execute(f('mr1'), 'doc1', ['v1', 'ghost']))).toBe(MARKETING_CODES.visualNotFound);
    expect(store.rows).toHaveLength(0);
  });

  it('a visual turned off later is hidden from the MR but shown, with its status, to a manager and Admin', async () => {
    await add.execute(f('mr1'), 'doc1', ['v1', 'v2']);
    visuals.rows.find((v) => v.id === 'v2')!.status = 'inactive';
    expect((await list.execute(f('mr1'), 'doc1')).items.map((i) => i.visual.id)).toEqual(['v1']);
    const seen = (await list.execute(f('asm'), 'doc1')).items;
    expect(seen.map((i) => [i.visual.id, i.visual.status])).toEqual([['v1', 'active'], ['v2', 'inactive']]);
  });
});

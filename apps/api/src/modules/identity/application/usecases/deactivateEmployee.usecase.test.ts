import { describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import { isAccessRevoked } from '@/shared/http/accessRevocations.js';
import type { OffboardingPort } from '../../domain/offboarding.port.js';
import { DeactivateEmployeeUseCase } from './deactivateEmployee.usecase.js';
import { ReassignManagerUseCase } from './reassignManager.usecase.js';

const LEVEL: Record<string, number> = { MR: 1, ASM: 2, RSM: 3 };
type Person = { name: string; designation: string; managerId: string | null; status?: 'active' | 'pending' | 'inactive'; role?: string };
const NOW = new Date('2026-10-22T06:00:00Z');

/** An org as id → person; the employee profile is complete, so a reactivated account comes back `active`. */
function build(people: Record<string, Person>) {
  const users = new Map(
    Object.entries(people).map(([id, p]) => [id, { id, name: p.name, employeeCode: id.toUpperCase(), status: p.status ?? 'active', roleId: p.role ?? 'FIELD', deactivatedAt: null as Date | null, deletedAt: null }]),
  );
  const complete = { mobileNumber: '9830012345', dateOfBirth: new Date('1990-01-01'), address: { district: 'D', state: 'S', pincode: '700001', country: 'IN' }, payBandId: 'b1', bankDetails: { bankName: 'B', ifsc: 'I', accountNumber: '1', accountHolderName: 'H' } };
  const profiles = new Map(
    Object.entries(people).map(([id, p]) => [id, { userId: id, designationId: p.designation, managerId: p.managerId, dateOfJoining: new Date('2026-01-10'), lastWorkingDay: null as string | null, rejoinedOn: null as string | null, ...complete }]),
  );
  const revoked: string[] = [];
  const released: Array<{ userId: string; lastWorkingDay: string; doctorHandoverTo: string | null }> = [];
  const userRepo = {
    findById: async (id: string) => users.get(id) ?? null,
    findByIds: async (ids: string[]) => ids.flatMap((id) => (users.has(id) ? [users.get(id)!] : [])),
    update: async (id: string, patch: object) => {
      users.set(id, { ...users.get(id)!, ...patch });
      return users.get(id);
    },
  };
  const profileRepo = {
    findByUserId: async (id: string) => profiles.get(id) ?? null,
    findByUserIds: async (ids: string[]) => ids.flatMap((id) => (profiles.has(id) ? [profiles.get(id)!] : [])),
    findUserIdsByFilter: async (f: { managerId?: string }) => [...profiles.values()].filter((p) => p.managerId === f.managerId).map((p) => p.userId),
    upsert: async (id: string, patch: object) => {
      profiles.set(id, { ...profiles.get(id)!, ...patch });
      return profiles.get(id);
    },
  };
  const roles = { findById: async (id: string) => ({ id, name: id }) };
  const sessions = { revokeAllForUser: async (id: string) => void revoked.push(id) };
  const reassign = new ReassignManagerUseCase(userRepo as never, profileRepo as never, { findById: async (d: string) => ({ id: d, level: LEVEL[d] }) } as never, { record: async () => undefined } as never, async () => '2026-10');
  const useCase = new DeactivateEmployeeUseCase(userRepo as never, profileRepo as never, roles as never, sessions as never, reassign, async () => '2026-10-22', () => NOW);
  const offboarding: OffboardingPort = {
    impact: async () => ({ routes: 3, coverage: 1, doctors: 12, distributors: 2, plansAfter: 1, leavesAfter: 0, targetsAfter: 1, waitingOnThem: 4 }),
    release: async (userId, input) => {
      released.push({ userId, ...input });
      return [{ step: 'DOCTORS', ok: true, detail: '12 doctors handed over, 0 left unassigned.' }];
    },
  };
  useCase.bindOffboarding(offboarding);
  return { useCase, users, profiles, revoked, released };
}

const org: Record<string, Person> = {
  rsm: { name: 'Ravi', designation: 'RSM', managerId: null },
  asm: { name: 'Asha', designation: 'ASM', managerId: 'rsm' },
  mr1: { name: 'Mona', designation: 'MR', managerId: 'asm' },
  mr2: { name: 'Manu', designation: 'MR', managerId: 'asm' },
  mrOld: { name: 'Old', designation: 'MR', managerId: 'asm', status: 'inactive' },
};
const code = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (e as AppError).publicDetails as { field?: string });

describe('deactivating an employee', () => {
  it('shows the impact: their team (not inactive people), their manager as the suggested new one, and the work elsewhere', async () => {
    const impact = await build(org).useCase.impact('asm');
    expect(impact.directReports.map((p) => p.id)).toEqual(['mr1', 'mr2']);
    expect(impact.suggestedManager).toMatchObject({ id: 'rsm', name: 'Ravi' });
    expect(impact).toMatchObject({ today: '2026-10-22', work: { doctors: 12, waitingOnThem: 4 } });
  });

  it('a manager: the team moves to the new manager, the account goes inactive with its last day, sessions and tokens end, the work is released', async () => {
    const w = build(org);
    const result = await w.useCase.deactivate('admin', 'asm', { lastWorkingDay: '2026-10-20', newManagerId: 'rsm', doctorHandoverTo: 'mr1' });
    expect(result).toMatchObject({ alreadyInactive: false, teamMoved: 2, steps: [{ step: 'DOCTORS', ok: true }] });
    expect(w.profiles.get('mr1')!.managerId).toBe('rsm');
    expect(w.profiles.get('mr2')!.managerId).toBe('rsm');
    expect(w.users.get('asm')).toMatchObject({ status: 'inactive', deactivatedAt: NOW });
    expect(w.profiles.get('asm')!.lastWorkingDay).toBe('2026-10-20');
    expect(w.revoked).toEqual(['asm']);
    expect(isAccessRevoked('asm', Math.floor(NOW.getTime() / 1000) - 60, NOW)).toBe(true);
    expect(w.released).toEqual([{ userId: 'asm', lastWorkingDay: '2026-10-20', doctorHandoverTo: 'mr1' }]);
  });

  it('a manager needs a new manager for the team, and an unfit one changes nothing at all', async () => {
    const w = build(org);
    expect((await code(w.useCase.deactivate('admin', 'asm', { lastWorkingDay: '2026-10-20' })))?.field).toBe('newManagerId');
    // An MR can't manage an ASM's team: the bulk move refuses, and nobody is moved or deactivated.
    await expect(w.useCase.deactivate('admin', 'asm', { lastWorkingDay: '2026-10-20', newManagerId: 'mr2' })).rejects.toBeInstanceOf(AppError);
    expect(w.profiles.get('mr1')!.managerId).toBe('asm');
    expect(w.users.get('asm')!.status).toBe('active');
    expect(w.released).toEqual([]);
  });

  it('refuses oneself, a future last day, one before joining, and a hand-over to someone inactive', async () => {
    const w = build(org);
    await expect(w.useCase.deactivate('mr1', 'mr1', { lastWorkingDay: '2026-10-20' })).rejects.toBeInstanceOf(AppError);
    expect((await code(w.useCase.deactivate('admin', 'mr1', { lastWorkingDay: '2026-10-23' })))?.field).toBe('lastWorkingDay');
    expect((await code(w.useCase.deactivate('admin', 'mr1', { lastWorkingDay: '2025-12-31' })))?.field).toBe('lastWorkingDay');
    expect((await code(w.useCase.deactivate('admin', 'mr1', { lastWorkingDay: '2026-10-20', doctorHandoverTo: 'mrOld' })))?.field).toBe('doctorHandoverTo');
    expect(w.users.get('mr1')!.status).toBe('active');
  });

  it('on an account already inactive, only the release runs again, on the recorded last day', async () => {
    const w = build(org);
    await w.useCase.deactivate('admin', 'mr1', { lastWorkingDay: '2026-10-15' });
    const again = await w.useCase.deactivate('admin', 'mr1', { lastWorkingDay: '2026-10-21', doctorHandoverTo: 'mr2' });
    expect(again).toMatchObject({ alreadyInactive: true, teamMoved: 0 });
    expect(w.released.at(-1)).toEqual({ userId: 'mr1', lastWorkingDay: '2026-10-15', doctorHandoverTo: 'mr2' });
    expect(w.revoked).toEqual(['mr1']);
  });

  it('reactivates (rehire) from a day after the last working day, with tokens working again', async () => {
    const w = build(org);
    await w.useCase.deactivate('admin', 'mr1', { lastWorkingDay: '2026-10-10' });
    expect((await code(w.useCase.reactivate('mr1', { rejoinedOn: '2026-10-10' })))?.field).toBe('rejoinedOn');
    expect((await code(w.useCase.reactivate('mr1', { rejoinedOn: '2026-10-23' })))?.field).toBe('rejoinedOn');
    expect(await w.useCase.reactivate('mr1', { rejoinedOn: '2026-10-20' })).toEqual({ status: 'active' });
    expect(w.users.get('mr1')).toMatchObject({ status: 'active', deactivatedAt: null });
    expect(w.profiles.get('mr1')!.rejoinedOn).toBe('2026-10-20');
    expect(isAccessRevoked('mr1', Math.floor(NOW.getTime() / 1000) - 60, NOW)).toBe(false);
    await expect(w.useCase.reactivate('mr2', { rejoinedOn: '2026-10-20' })).rejects.toMatchObject({ statusCode: 409 });
  });

  it('someone who has left can’t be made a manager again by the bulk move', async () => {
    const w = build(org);
    await w.useCase.deactivate('admin', 'mr2', { lastWorkingDay: '2026-10-20' });
    const reassign = new ReassignManagerUseCase(
      { findById: async (id: string) => w.users.get(id) ?? null, findByIds: async (ids: string[]) => ids.map((id) => w.users.get(id)!) } as never,
      { findByUserIds: async () => [], findByUserId: async () => null, upsert: async () => null } as never,
      { findById: async () => null } as never,
      { record: async () => undefined } as never,
      async () => '2026-10',
    );
    await expect(reassign.execute('admin', { userIds: ['mr1'], managerId: 'mr2' })).rejects.toMatchObject({ statusCode: 400 });
  });
});


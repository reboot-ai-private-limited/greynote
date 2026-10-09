import { describe, expect, it } from 'vitest';
import type { EmployeeDraft, EmployeeDraftData } from '../../domain/employeeDraft.entity.js';
import { FinalizeEmployeeDraftUseCase } from './finalizeEmployeeDraft.usecase.js';

const address = { line1: '12 Park St', district: 'Kolkata', state: 'West Bengal', pincode: '700016' };

const complete = (extra: Partial<EmployeeDraftData> = {}): EmployeeDraftData => ({
  personal: { name: 'Asha', mobileNumber: '9830012345', guardianName: 'R. Rao', dateOfBirth: '1990-01-01', dateOfJoining: '2026-10-01' },
  address: { present: address, permanentSameAsPresent: true },
  bank: { bankName: 'SBI', accountNumber: '1', accountHolderName: 'Asha', ifsc: 'SBIN0000001', branchName: 'Park St' },
  work: { designationId: 'des-1', hqId: 'hq-1', managerId: 'boss' },
  compensation: { payBandId: 'g1', ctcAnnualPaise: 60000000 },
  ...extra,
});

function build(data: EmployeeDraftData, opts: { createdUserId?: string; failHqOnce?: boolean } = {}) {
  let draft: EmployeeDraft | null = {
    id: 'd1', createdBy: 'admin', step: 7, data, createdUserId: opts.createdUserId ?? null,
    createdAt: new Date(), updatedAt: new Date(),
  };
  const calls: string[] = [];
  const users = new Map<string, { id: string; employeeCode: string; passwordHash: string }>();
  if (opts.createdUserId) users.set(opts.createdUserId, { id: opts.createdUserId, employeeCode: 'GRN0007', passwordHash: 'old' });
  let ctcSaved = false;
  const ctcInput: unknown[] = [];
  let hqFailures = opts.failHqOnce ? 1 : 0;
  let codeSeq = 0;

  const useCase = new FinalizeEmployeeDraftUseCase(
    {
      findById: async () => draft,
      update: async (_id: string, patch: { createdUserId?: string }) => {
        if (draft && patch.createdUserId) draft = { ...draft, createdUserId: patch.createdUserId };
        return draft;
      },
      delete: async () => { draft = null; calls.push('draft deleted'); },
    } as never,
    {
      findById: async (id: string) => users.get(id) ?? null,
      update: async (id: string, patch: { passwordHash: string }) => { Object.assign(users.get(id) as object, patch); },
    } as never,
    { list: async () => [{ id: 'des-1', level: 1 }, { id: 'des-top', level: 5 }] } as never,
    { next: async () => `GRN000${++codeSeq}` } as never,
    {
      execute: async (_role: string, input: { employeeCode: string; password: string }) => {
        calls.push(`create ${input.employeeCode}`);
        users.set('u1', { id: 'u1', employeeCode: input.employeeCode, passwordHash: input.password });
        return { id: 'u1' };
      },
    } as never,
    { execute: async (id: string, input: Record<string, unknown>) => { calls.push(`update ${id} ${input.managerId ?? 'no-manager'}`); } } as never,
    { execute: async (_id: string, input: unknown) => { calls.push('ctc'); ctcInput.push(input); ctcSaved = true; } } as never,
    { findEffective: async () => (ctcSaved ? {} : null) } as never,
    { hash: async (p: string) => `hash:${p}` } as never,
    () => async (userId: string, hqId: string) => {
      if (hqFailures-- > 0) throw new Error('hq down');
      calls.push(`hq ${userId} ${hqId}`);
    },
    async () => '2026-10',
  );
  return { useCase, calls, users, ctcInput, draftNow: () => draft };
}

const actor = { id: 'admin', role: 'HR' as const };

describe('FinalizeEmployeeDraftUseCase', () => {
  it('creates the login, fills the profile, sets the HQ and CTC, and removes the draft', async () => {
    const { useCase, calls } = build(complete());
    const result = await useCase.execute(actor, 'd1');
    expect(result).toMatchObject({ userId: 'u1', employeeCode: 'GRN0001' });
    expect(result.password).toHaveLength(12);
    expect(calls).toEqual(['create GRN0001', 'update u1 boss', 'hq u1 hq-1', 'ctc', 'draft deleted']);
  });

  it('refuses an incomplete draft and creates nothing', async () => {
    const { useCase, calls, draftNow } = build(complete({ bank: {} }));
    await expect(useCase.execute(actor, 'd1')).rejects.toMatchObject({ statusCode: 400 });
    expect(calls).toEqual([]);
    expect(draftNow()).not.toBeNull();
  });

  it('sends no manager for the top designation, even if one was left in the draft', async () => {
    const { useCase, calls } = build(complete({ work: { designationId: 'des-top', hqId: 'hq-1', managerId: 'boss' } }));
    await useCase.execute(actor, 'd1');
    expect(calls).toContain('update u1 no-manager');
  });

  it('after a failure, a retry reuses the login it made, with a fresh password and no second CTC', async () => {
    const { useCase, calls, users, draftNow } = build(complete(), { failHqOnce: true });
    await expect(useCase.execute(actor, 'd1')).rejects.toThrow('hq down');
    expect(draftNow()?.createdUserId).toBe('u1');

    const result = await useCase.execute(actor, 'd1');
    expect(result.employeeCode).toBe('GRN0001');
    expect(calls.filter((c) => c.startsWith('create'))).toHaveLength(1);
    expect(calls.filter((c) => c === 'ctc')).toHaveLength(1);
    expect(users.get('u1')?.passwordHash).toBe(`hash:${result.password}`);
  });

  it("hands the employee's own CTC structure to the CTC step", async () => {
    const structure = { basicBasisPoints: 4000, ruleOverrides: {}, removed: ['MEDICAL'], extras: [] };
    const { useCase, ctcInput } = build(complete({ compensation: { payBandId: 'g1', ctcAnnualPaise: 60000000, structure } }));
    await useCase.execute(actor, 'd1');
    expect(ctcInput).toEqual([expect.objectContaining({ ctcAnnualPaise: 60000000, structure })]);
  });
});

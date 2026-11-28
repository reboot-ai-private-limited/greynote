import { describe, expect, it } from 'vitest';
import { UpdateDoctorTargetsUseCase } from './updateDoctorTargets.usecase.js';

/** The visit frequency is Admin's alone (2026-11-28); a manager still sets the birthday and anniversary. */
describe('A doctor’s targets', () => {
  const row = { id: 'd1', visitFrequency: 2, dateOfBirth: null, anniversary: null };
  const doctors = {
    findById: async () => ({ ...row }),
    update: async (_id: string, change: Record<string, unknown>) => ({ ...row, ...change }),
  };
  const visibility = { canView: async () => true };
  const views = { one: async (d: Record<string, unknown>) => ({ ...d, assignedTo: { userId: 'mr1', name: 'MR', employeeCode: 'MR1' } }) };
  const use = new UpdateDoctorTargetsUseCase(doctors as never, visibility as never, views as never);
  const asm = { id: 'asm', role: 'FIELD' as const };

  it('refuses a manager’s new visit frequency, but takes the birthday and the same frequency again', async () => {
    await expect(use.execute(asm, 'd1', { visitFrequency: 4 })).rejects.toMatchObject({ statusCode: 403 });
    await expect(use.execute(asm, 'd1', { dateOfBirth: '1980-05-12', visitFrequency: 2 })).resolves.toMatchObject({ dateOfBirth: '1980-05-12', visitFrequency: 2 });
  });

  it('lets Admin change it', async () => {
    await expect(use.execute({ id: 'admin', role: 'ADMIN' }, 'd1', { visitFrequency: 4 })).resolves.toMatchObject({ visitFrequency: 4 });
  });
});

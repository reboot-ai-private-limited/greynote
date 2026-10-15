import { describe, expect, it } from 'vitest';
import type { UserSummary } from '../../domain/user.entity.js';
import { GetReportingLineUseCase } from './getReportingLine.usecase.js';

const person = (id: string, managerId: string | null): UserSummary => ({
  id,
  employeeCode: id,
  name: id,
  role: 'FIELD',
  designationId: null,
  managerId,
  status: 'ACTIVE',
});

describe('GetReportingLineUseCase', () => {
  it('returns the managers above and the downline below', async () => {
    const useCase = new GetReportingLineUseCase(
      async () => [person('rsm', 'zsm'), person('zsm', null)],
      async () => [{ ...person('mr', 'asm'), depth: 2 }],
    );
    const result = await useCase.execute('asm');
    expect(result.upline.map((u) => u.id)).toEqual(['rsm', 'zsm']);
    expect(result.downline.map((d) => d.id)).toEqual(['mr']);
  });

  it('returns empty lists for someone at the top with no team', async () => {
    const useCase = new GetReportingLineUseCase(async () => [], async () => []);
    expect(await useCase.execute('nsm')).toEqual({ upline: [], downline: [] });
  });
});

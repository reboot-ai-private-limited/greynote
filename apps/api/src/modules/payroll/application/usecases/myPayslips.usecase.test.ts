import { describe, expect, it } from 'vitest';
import type { PayrollFilter, PayrollRunRepositoryPort } from '../../domain/payroll.repository.port.js';
import { ListMyPayslipsUseCase } from './payroll.usecase.js';

describe('ListMyPayslipsUseCase', () => {
  it('asks for the caller’s finalized runs only, whatever else is passed', async () => {
    const seen: PayrollFilter[] = [];
    const runs = { list: async (f: PayrollFilter) => (seen.push(f), []) } as unknown as PayrollRunRepositoryPort;
    await new ListMyPayslipsUseCase(runs).execute('mr1', { fromMonth: '2026-04', toMonth: '2027-03' });
    expect(seen).toEqual([{ fromMonth: '2026-04', toMonth: '2027-03', userId: 'mr1', status: 'FINALIZED' }]);
  });
});

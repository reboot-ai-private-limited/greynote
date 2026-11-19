import type { DoctorServiceDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { totalServices } from './serviceTotals';

const row = (over: Partial<DoctorServiceDto>): DoctorServiceDto => ({ id: Math.random().toString(), doctorId: 'd1', doctorName: 'Dr A', serviceType: 'HONORARIUM', amountPaise: 100_000, status: 'APPROVED', doneAt: null, ...over }) as DoctorServiceDto;

describe('totalServices', () => {
  it('counts approved as gone to the doctor, waiting apart, done inside approved, and ignores the rest', () => {
    const r = totalServices([row({}), row({ amountPaise: 50_000, doneAt: '2026-11-01T00:00:00Z' }), row({ status: 'SUBMITTED', amountPaise: 20_000 }), row({ status: 'REJECTED' }), row({ doctorId: 'd2', doctorName: 'Dr B', amountPaise: 400_000 })]);
    expect(r.totals).toEqual({ requests: 4, approvedPaise: 550_000, waitingPaise: 20_000, donePaise: 50_000 });
    expect(r.doctors.map((d) => d.doctorName)).toEqual(['Dr B', 'Dr A']);
  });
});

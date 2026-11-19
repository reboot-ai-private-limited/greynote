import { describe, expect, it } from 'vitest';
import { summariseServices, type SummaryService } from './serviceSummary.js';

const svc = (over: Partial<SummaryService> = {}): SummaryService => ({ doctorId: 'd1', doctorName: 'Dr A', userName: 'Mr X', serviceType: 'HONORARIUM', amountPaise: 100_000, status: 'APPROVED', doneAt: null, ...over });

describe('summariseServices', () => {
  it('one row per doctor with the approved amount by type, waiting apart, done inside approved', () => {
    const r = summariseServices([
      svc(),
      svc({ serviceType: 'CME', amountPaise: 50_000, doneAt: new Date('2026-11-01') }),
      svc({ serviceType: 'TRAINING', amountPaise: 20_000, status: 'SUBMITTED' }),
      svc({ doctorId: 'd2', doctorName: 'Dr B', userName: 'Mr Y', serviceType: 'ONLINE_PROMOTION', amountPaise: 400_000, status: 'MANAGER_APPROVED' }),
    ]);
    expect(r.doctors.map((d) => d.doctorName)).toEqual(['Dr B', 'Dr A']); // the biggest approved amount first
    const a = r.doctors.find((d) => d.doctorId === 'd1')!;
    expect(a).toMatchObject({ requests: 3, approvedPaise: 150_000, waitingPaise: 20_000, donePaise: 50_000, mrNames: ['Mr X'] });
    expect(a.approvedByType).toMatchObject({ HONORARIUM: 100_000, CME: 50_000, TRAINING: 0, ONLINE_PROMOTION: 0, OTHERS: 0, GIFT: 0 });
    expect(r.totals).toMatchObject({ requests: 4, approvedPaise: 550_000, waitingPaise: 20_000, donePaise: 50_000 });
  });

  it('leaves out rejected, withdrawn and unsent requests, and keeps an old type readable', () => {
    const r = summariseServices([svc({ status: 'REJECTED' }), svc({ status: 'WITHDRAWN' }), svc({ status: 'DRAFT' }), svc({ serviceType: 'TOUR_PACKAGE', amountPaise: 30_000 })]);
    expect(r.totals).toMatchObject({ requests: 1, approvedPaise: 30_000 });
    expect(r.totals.approvedByType.TOUR_PACKAGE).toBe(30_000);
  });

  it('lists every MR a doctor has requests from, A to Z', () => {
    const r = summariseServices([svc({ userName: 'Zed' }), svc({ userName: 'Amy' }), svc({ userName: 'Zed' })]);
    expect(r.doctors[0]?.mrNames).toEqual(['Amy', 'Zed']);
  });

  it('is empty when there is nothing', () => {
    expect(summariseServices([])).toMatchObject({ doctors: [], totals: { requests: 0, approvedPaise: 0, waitingPaise: 0, donePaise: 0 } });
  });
});

import type { DoctorServiceDto } from '@greynote/contracts';

export interface ServiceTotals {
  requests: number;
  approvedPaise: number;
  waitingPaise: number;
  donePaise: number;
}
export interface DoctorTotalsRow extends ServiceTotals {
  doctorId: string;
  doctorName: string;
}

const approved = (s: Pick<DoctorServiceDto, 'status'>) => s.status === 'APPROVED' || s.status === 'MANAGER_APPROVED';

/**
 * What the rows add up to (decision-log 2026-11-19): approved is what has gone to the doctor, waiting is still to be decided, done is the approved part carried out;
 * a rejected or withdrawn request counts for nothing. One row per doctor, the biggest approved amount first.
 */
export function totalServices(rows: readonly DoctorServiceDto[]): { totals: ServiceTotals; doctors: DoctorTotalsRow[] } {
  const totals: ServiceTotals = { requests: 0, approvedPaise: 0, waitingPaise: 0, donePaise: 0 };
  const byDoctor = new Map<string, DoctorTotalsRow>();
  for (const s of rows) {
    const ok = approved(s);
    if (!ok && s.status !== 'SUBMITTED') continue;
    const d = byDoctor.get(s.doctorId) ?? { doctorId: s.doctorId, doctorName: s.doctorName || 'Unknown', requests: 0, approvedPaise: 0, waitingPaise: 0, donePaise: 0 };
    byDoctor.set(s.doctorId, d);
    for (const t of [d, totals]) {
      t.requests += 1;
      if (ok) {
        t.approvedPaise += s.amountPaise;
        if (s.doneAt) t.donePaise += s.amountPaise;
      } else t.waitingPaise += s.amountPaise;
    }
  }
  return { totals, doctors: [...byDoctor.values()].sort((a, b) => b.approvedPaise - a.approvedPaise || a.doctorName.localeCompare(b.doctorName)) };
}

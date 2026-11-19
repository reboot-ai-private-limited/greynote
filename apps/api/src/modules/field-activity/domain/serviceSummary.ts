import type { Paise } from '@/shared/money/paise.js';
import { ALL_DOCTOR_SERVICE_TYPES, type DoctorServiceType } from './serviceGift.entity.js';

/** One service as the totals read it: enough to count it, nothing more. */
export interface SummaryService {
  doctorId: string;
  doctorName: string;
  userName: string;
  serviceType: DoctorServiceType;
  amountPaise: Paise;
  /** The approval status; `APPROVED` for an Admin-made one. */
  status: string;
  doneAt: Date | null;
}

/** Amounts by type, in paise; every type present (0 when none). */
export type ByType = Record<DoctorServiceType, Paise>;

export interface DoctorServiceTotals {
  doctorId: string;
  doctorName: string;
  /** The MRs the services are tied to, A–Z. */
  mrNames: string[];
  /** Requests that count: approved or waiting (rejected and withdrawn are left out). */
  requests: number;
  /** What was approved, by type. */
  approvedByType: ByType;
  /** Approved: money that has gone to (or is committed to) the doctor. */
  approvedPaise: Paise;
  /** Still waiting for a decision. */
  waitingPaise: Paise;
  /** Of the approved, what has been carried out. */
  donePaise: Paise;
}

export interface ServiceSummary {
  /** One row per doctor, the biggest approved amount first, then A–Z. */
  doctors: DoctorServiceTotals[];
  totals: Omit<DoctorServiceTotals, 'doctorId' | 'doctorName' | 'mrNames'>;
}

const zeroByType = (): ByType => Object.fromEntries(ALL_DOCTOR_SERVICE_TYPES.map((t) => [t, 0])) as ByType;
const APPROVED = new Set(['APPROVED', 'MANAGER_APPROVED']);

/**
 * Totals for a run of services, one row per doctor (decision-log 2026-11-19). "Gone to the doctor" is what is approved; what still waits for a decision is shown
 * apart; a rejected or withdrawn request counts for nothing. Done is the part of the approved that has been carried out.
 */
export function summariseServices(rows: readonly SummaryService[]): ServiceSummary {
  const byDoctor = new Map<string, DoctorServiceTotals & { mrs: Set<string> }>();
  const totals: ServiceSummary['totals'] = { requests: 0, approvedByType: zeroByType(), approvedPaise: 0, waitingPaise: 0, donePaise: 0 };
  for (const s of rows) {
    const approved = APPROVED.has(s.status);
    const waiting = s.status === 'SUBMITTED';
    if (!approved && !waiting) continue;
    const d =
      byDoctor.get(s.doctorId) ??
      { doctorId: s.doctorId, doctorName: s.doctorName, mrNames: [], mrs: new Set<string>(), requests: 0, approvedByType: zeroByType(), approvedPaise: 0, waitingPaise: 0, donePaise: 0 };
    byDoctor.set(s.doctorId, d);
    if (s.userName) d.mrs.add(s.userName);
    for (const t of [d, totals]) {
      t.requests += 1;
      if (approved) {
        t.approvedByType[s.serviceType] += s.amountPaise;
        t.approvedPaise += s.amountPaise;
        if (s.doneAt) t.donePaise += s.amountPaise;
      } else t.waitingPaise += s.amountPaise;
    }
  }
  const doctors = [...byDoctor.values()]
    .map(({ mrs, ...d }) => ({ ...d, mrNames: [...mrs].sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) => b.approvedPaise - a.approvedPaise || a.doctorName.localeCompare(b.doctorName));
  return { doctors, totals };
}

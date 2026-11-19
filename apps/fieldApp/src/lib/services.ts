import type { DoctorServiceType, PlanStatus } from '@/types/sync';

import { apiGet, apiGetFile } from './api';
import { deliverXlsx } from './csv';

/**
 * The MR's own Doctor Services with how far each has got (docs/mobile/visuals-gifts-services.md §3). The offline snapshot
 * has the approval status only; this list also says whether Admin / Accounts has carried the service out.
 */
export type ServiceView = {
  id: string;
  doctorId: string;
  doctorName?: string;
  serviceType: DoctorServiceType;
  amountPaise: number;
  remarks: string | null;
  origin: 'MR' | 'ADMIN';
  status: PlanStatus;
  approval: { requestId: string; cycle: number } | null;
  doneAt: string | null;
  /** Approved and not yet marked done. */
  awaitingDone: boolean;
  /** Who the request is tied to, on a manager's team list. */
  userId?: string;
  userName?: string;
  createdAt?: string;
};

export const listMyServices = async () => listServices(false);

/** The requests listed on the Services page. A manager passes `team` to also get everyone below them (each named). */
export const listServices = async (team: boolean) => {
  const data = await apiGet<ServiceView[] | { items: ServiceView[] }>(`/field-activity/doctor-services${team ? '?scope=team' : ''}`, { auth: true });
  return Array.isArray(data) ? data : data.items;
};

export type ServiceStage = { text: string; accent: 'amber' | 'blue' | 'green' | 'red' | 'slate' };

/** Waiting for approval → Approved, to do → Done (or Rejected). The MR never marks a service done. */
export function serviceStage(s: { status: PlanStatus; origin: 'MR' | 'ADMIN'; awaitingDone?: boolean; doneAt?: string | null }): ServiceStage {
  if (s.doneAt) return { text: 'Done', accent: 'green' };
  if (s.status === 'REJECTED') return { text: 'Rejected', accent: 'red' };
  if (s.status === 'WITHDRAWN') return { text: 'Withdrawn', accent: 'slate' };
  if (s.status === 'REOPENED') return { text: 'Reopened', accent: 'slate' };
  // One approval (2026-10-23): an older request left at MANAGER_APPROVED counts as approved.
  if (s.status === 'APPROVED' || s.status === 'MANAGER_APPROVED') return { text: 'Approved, to do', accent: 'blue' };
  return { text: 'Waiting for approval', accent: 'amber' };
}

/** What a type is called, including the two older ones that remain on old rows. */
export const SERVICE_TYPE_LABEL: Record<DoctorServiceType, string> = {
  HONORARIUM: 'Honorarium',
  CME: 'CME',
  TRAINING: 'Training',
  ONLINE_PROMOTION: 'Online promotion',
  OTHERS: 'Others',
  TOUR_PACKAGE: 'Tour package',
  GIFT: 'Gift',
};

export type ServiceTotals = { requests: number; approvedPaise: number; waitingPaise: number };
export type DoctorServiceRow = ServiceTotals & { doctorId: string; doctorName: string };

/**
 * Totals of the requests shown (decision-log 2026-11-19): what is **approved** is what has gone to the doctor, what still waits for a decision is shown apart, and a
 * rejected or withdrawn request counts for nothing. One row per doctor, the biggest approved amount first. Worked out on the phone from the list it already has.
 */
export function totalServices(rows: ServiceView[], nameOf: (s: ServiceView) => string): { totals: ServiceTotals; doctors: DoctorServiceRow[] } {
  const totals: ServiceTotals = { requests: 0, approvedPaise: 0, waitingPaise: 0 };
  const byDoctor = new Map<string, DoctorServiceRow>();
  for (const s of rows) {
    const approved = s.status === 'APPROVED' || s.status === 'MANAGER_APPROVED';
    if (!approved && s.status !== 'SUBMITTED') continue;
    const d = byDoctor.get(s.doctorId) ?? { doctorId: s.doctorId, doctorName: nameOf(s), requests: 0, approvedPaise: 0, waitingPaise: 0 };
    byDoctor.set(s.doctorId, d);
    for (const t of [d, totals]) {
      t.requests += 1;
      if (approved) t.approvedPaise += s.amountPaise;
      else t.waitingPaise += s.amountPaise;
    }
  }
  return { totals, doctors: [...byDoctor.values()].sort((a, b) => b.approvedPaise - a.approvedPaise || a.doctorName.localeCompare(b.doctorName)) };
}

/** The Excel workbook of the requests (By doctor with totals, and Requests), for me or, for a manager, my team. The server builds it. */
export async function downloadServicesReport(team: boolean): Promise<string | null> {
  const bytes = await apiGetFile(`/field-activity/doctor-services/report${team ? '?scope=team' : '?scope=mine'}`);
  return deliverXlsx(`GREYNOTE DOCTOR SERVICES ${team ? 'TEAM' : 'MINE'}.xlsx`, bytes, `Doctor services · ${team ? 'my team' : 'mine'}`);
}

import type { DoctorServiceType, PlanStatus } from '@/types/sync';

import { apiGet } from './api';

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
};

export const listMyServices = async () => {
  const data = await apiGet<ServiceView[] | { items: ServiceView[] }>('/field-activity/doctor-services', { auth: true });
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

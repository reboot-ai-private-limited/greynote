import type { Paise } from '@/shared/money/paise.js';

/** What a new Doctor Service can be (decision-log 2026-11-19; first set in sign-off H4). */
export const DOCTOR_SERVICE_TYPES = ['HONORARIUM', 'CME', 'TRAINING', 'ONLINE_PROMOTION', 'OTHERS'] as const;
/** The types before 2026-11-19: still on old rows and still accepted from a phone that queued one, never offered for a new request. */
export const LEGACY_DOCTOR_SERVICE_TYPES = ['TOUR_PACKAGE', 'GIFT'] as const;
export const ALL_DOCTOR_SERVICE_TYPES = [...DOCTOR_SERVICE_TYPES, ...LEGACY_DOCTOR_SERVICE_TYPES] as const;
export type DoctorServiceType = (typeof ALL_DOCTOR_SERVICE_TYPES)[number];

/**
 * A service for a Doctor — a bigger-ticket spend, approved before it counts. Its status is not stored: an
 * MR-made one is its `DOCTOR_SERVICE` approval request's (Employee → Manager → Admin), an Admin-made one
 * (`origin: 'ADMIN'`) has no request and is effective at once. Once approved, Admin or Accounts marks it done.
 */
export interface DoctorService {
  id: string;
  doctorId: string;
  /** The MR it is tied to: the submitter, or — Admin-created — the Doctor's assigned MR at that moment. */
  userId: string;
  createdBy: string;
  origin: 'MR' | 'ADMIN';
  serviceType: DoctorServiceType;
  amountPaise: Paise;
  remarks: string | null;
  /** The phone's id for an MR-made one — the sync client id; null when Admin created it. */
  clientId: string | null;
  createdAt: Date;
  /** The final step once it is approved: Admin or Accounts marks it carried out. Null until then. */
  doneBy: string | null;
  doneAt: Date | null;
}

/**
 * A gift for a Doctor. Admin allocates one (`origin: 'ADMIN'`, `PENDING` at once) or the employee asks for one (`origin: 'EMPLOYEE'`, `REQUESTED` until Admin or
 * Accounts accept it with an amount, which makes it `PENDING`, or reject it). The assigned MR marks a `PENDING` gift `DONE` once handed over, in a doctor call
 * or from the Gifts screen. No manager approval.
 */
export const GIFT_STATUSES = ['REQUESTED', 'PENDING', 'DONE', 'REJECTED'] as const;
export type GiftStatus = (typeof GIFT_STATUSES)[number];
export interface DoctorGift {
  id: string;
  doctorId: string;
  /** Admin: who allocated it. Employee request: who accepted it (`requestedBy` until then). */
  allocatedBy: string;
  productName: string;
  /** Whole paise; 0 on a request nobody has accepted yet. */
  amountPaise: Paise;
  status: GiftStatus;
  origin: 'ADMIN' | 'EMPLOYEE';
  /** The employee who asked for it; `null` for an Admin allocation. */
  requestedBy: string | null;
  requestNote: string | null;
  /** Why a request was rejected. */
  rejectReason: string | null;
  completedBy: string | null;
  completedAt: Date | null;
  allocatedAt: Date;
}

/** A service type as a row title: `ONLINE_PROMOTION` → `Online promotion`, `CME` → `CME`. */
export function serviceTypeTitle(type: DoctorServiceType): string {
  if (type === 'CME') return 'CME';
  const words = type.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

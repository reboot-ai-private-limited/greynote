import type { Paise } from '@/shared/money/paise.js';

/** What a Doctor Service can be (sign-off H4, working assumption while C8 is open). */
export const DOCTOR_SERVICE_TYPES = ['TOUR_PACKAGE', 'GIFT', 'ONLINE_PROMOTION', 'OTHERS'] as const;
export type DoctorServiceType = (typeof DOCTOR_SERVICE_TYPES)[number];

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

/** Admin's allocation of a gift to a Doctor; the assigned MR's only action is marking it done. No approval. */
export interface DoctorGift {
  id: string;
  doctorId: string;
  allocatedBy: string;
  productName: string;
  amountPaise: Paise;
  status: 'PENDING' | 'DONE';
  completedBy: string | null;
  completedAt: Date | null;
  allocatedAt: Date;
}

/** A service type as a row title: `TOUR_PACKAGE` → `Tour package`. */
export function serviceTypeTitle(type: DoctorServiceType): string {
  const words = type.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

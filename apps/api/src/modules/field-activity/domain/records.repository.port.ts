import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { DoctorGift, DoctorService } from './serviceGift.entity.js';
import type { Expense } from './expense.entity.js';
import type { ChemistCall, DoctorCall, Followup } from './call.entity.js';

/** A manager accepting a flagged call: who, when and why. */
export interface GeofenceOverride {
  by: string;
  at: Date;
  comment: string;
}

export interface DoctorCallRepositoryPort {
  create(input: Omit<DoctorCall, 'id'>, ctx: TransactionContext): Promise<DoctorCall>;
  listForDcr(dcrId: string): Promise<DoctorCall[]>;
  countForDcrs(dcrIds: string[]): Promise<Map<string, number>>;
  findById(id: string): Promise<DoctorCall | null>;
  /** One conditional update: only a still-`FAIL` / `UNVERIFIED` call becomes `OVERRIDE`. False if it no longer is (someone got there first). */
  overrideGeofence(id: string, override: GeofenceOverride): Promise<boolean>;
}
export interface ChemistCallRepositoryPort {
  create(input: Omit<ChemistCall, 'id'>, ctx: TransactionContext): Promise<ChemistCall>;
  listForDcr(dcrId: string): Promise<ChemistCall[]>;
  countForDcrs(dcrIds: string[]): Promise<Map<string, number>>;
  findById(id: string): Promise<ChemistCall | null>;
  overrideGeofence(id: string, override: GeofenceOverride): Promise<boolean>;
}
export interface FollowupRepositoryPort {
  create(input: Omit<Followup, 'id'>, ctx: TransactionContext): Promise<Followup>;
  listForDcr(dcrId: string): Promise<Followup[]>;
  countForDcrs(dcrIds: string[]): Promise<Map<string, number>>;
}
export interface ExpenseRepositoryPort {
  create(input: Omit<Expense, 'id'>, ctx: TransactionContext): Promise<Expense>;
  /** Whether the DCR already has AUTO rows that still count (not `CANCELLED`) — TA/DA is generated once per approval. */
  hasActiveAuto(dcrId: string, ctx: TransactionContext): Promise<boolean>;
  /** Marks the DCR's `UNPAID` AUTO rows `CANCELLED` (a `PAID` row is left); returns how many. */
  cancelUnpaidAuto(dcrId: string, ctx: TransactionContext): Promise<number>;
  /** Sets `accepted` on the DCR's rows that aren't `PAID` (a paid row keeps what it was). */
  setAccepted(dcrId: string, accepted: boolean, ctx: TransactionContext): Promise<void>;
  findById(id: string): Promise<Expense | null>;
  /** One conditional update: only an `accepted`, still-`UNPAID` row becomes `PAID`. False if it isn't one. */
  markPaid(id: string, by: string, at: Date): Promise<boolean>;
  /** The accepted rows in a date range, `UNPAID` first then `PAID`, oldest day first; at most `limit`. */
  listAccepted(filter: { from: string; to: string; userId?: string; paymentStatus?: 'UNPAID' | 'PAID' }, limit: number): Promise<Expense[]>;
  /** The whole paise marked `PAID` for a user *during* the period (`from` inclusive, `to` exclusive, by `paid_at`): TA, DA and the manual reimbursements apart. */
  paidTotals(userId: string, period: { from: Date; to: Date }): Promise<{ taPaise: number; daPaise: number; reimbursementPaise: number }>;
  /** Per DCR, what is claimed: TA, DA and the manual rows, `CANCELLED` left out, and how much of it is `PAID`. */
  totalsForDcrs(dcrIds: string[]): Promise<Map<string, { taPaise: number; daPaise: number; otherPaise: number; paidPaise: number }>>;
  listForDcr(dcrId: string): Promise<Expense[]>;
}

export interface DoctorServiceRepositoryPort {
  create(input: Omit<DoctorService, 'id'>, ctx?: TransactionContext): Promise<DoctorService>;
  findById(id: string): Promise<DoctorService | null>;
  /** Newest first, at most `limit`; every filter is optional. */
  list(filter: { userId?: string; doctorId?: string }, limit: number): Promise<DoctorService[]>;
}

export interface DoctorGiftRepositoryPort {
  create(input: Omit<DoctorGift, 'id'>): Promise<DoctorGift>;
  findById(id: string): Promise<DoctorGift | null>;
  /** Newest first, at most `limit`; `doctorIds` narrows to those Doctors (an MR's own). */
  list(filter: { doctorIds?: string[]; status?: DoctorGift['status'] }, limit: number): Promise<DoctorGift[]>;
  /** One conditional update: only a still-`PENDING` gift becomes `DONE`. False if it no longer is. */
  markDone(id: string, by: string, at: Date, ctx: TransactionContext): Promise<boolean>;
}

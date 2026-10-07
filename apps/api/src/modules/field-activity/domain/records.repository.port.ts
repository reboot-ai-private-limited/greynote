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

/** How many calls of a day's report ended with each geofence result: a report's read. */
export interface GeofenceCount {
  dcrId: string;
  status: 'PASS' | 'FAIL' | 'UNVERIFIED' | 'OVERRIDE';
  count: number;
}

export interface DoctorCallRepositoryPort {
  /** Per daily report and geofence result, for report days in the range (both ends inclusive). */
  countByGeofence(range: { from: string; to: string }): Promise<GeofenceCount[]>;
  /** The distinct Doctors called in these daily reports. */
  distinctDoctorIds(dcrIds: string[]): Promise<string[]>;
  create(input: Omit<DoctorCall, 'id'>, ctx: TransactionContext): Promise<DoctorCall>;
  listForDcr(dcrId: string): Promise<DoctorCall[]>;
  countForDcrs(dcrIds: string[]): Promise<Map<string, number>>;
  findById(id: string): Promise<DoctorCall | null>;
  /** One conditional update: only a still-`FAIL` / `UNVERIFIED` call becomes `OVERRIDE`. False if it no longer is (someone got there first). */
  overrideGeofence(id: string, override: GeofenceOverride): Promise<boolean>;
}
export interface ChemistCallRepositoryPort {
  countByGeofence(range: { from: string; to: string }): Promise<GeofenceCount[]>;
  create(input: Omit<ChemistCall, 'id'>, ctx: TransactionContext): Promise<ChemistCall>;
  listForDcr(dcrId: string): Promise<ChemistCall[]>;
  countForDcrs(dcrIds: string[]): Promise<Map<string, number>>;
  findById(id: string): Promise<ChemistCall | null>;
  overrideGeofence(id: string, override: GeofenceOverride): Promise<boolean>;
}
export interface FollowupRepositoryPort {
  /** Per daily report, for report days in the range (both ends inclusive). */
  countByDcrRange(range: { from: string; to: string }): Promise<Array<{ dcrId: string; count: number }>>;
  create(input: Omit<Followup, 'id'>, ctx: TransactionContext): Promise<Followup>;
  listForDcr(dcrId: string): Promise<Followup[]>;
  countForDcrs(dcrIds: string[]): Promise<Map<string, number>>;
}
/** TA, DA and the manual reimbursements (travel, meals, other) apart, in whole paise, and how many rows. */
export interface ExpenseBucket {
  taPaise: number;
  daPaise: number;
  reimbursementPaise: number;
  count: number;
}
export interface ExpenseStatement {
  userId: string;
  unpaid: ExpenseBucket;
  paid: ExpenseBucket;
  lastPaidAt: Date | null;
}

/** One employee's accepted expenses for one report month (`YYYY-MM`, by the day reported), `CANCELLED` left out. */
export interface ExpenseMonthSummary {
  userId: string;
  month: string;
  taPaise: number;
  daPaise: number;
  /** The manual claims: travel, meals, other. */
  reimbursementPaise: number;
  paidPaise: number;
  unpaidPaise: number;
  /** Rows (AUTO TA) whose route distance could not be calculated, so the amount is artificially low. */
  flaggedRows: number;
}

export interface ExpenseRepositoryPort {
  /** The accepted expenses whose report day falls in the range (`YYYY-MM-DD`, both inclusive), per employee and month. */
  summarizeByMonth(range: { from: string; to: string }): Promise<ExpenseMonthSummary[]>;
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
  /**
   * Per employee, the accepted expenses whose report day falls in the range (`YYYY-MM-DD`, both inclusive), `CANCELLED` left out:
   * what is still `UNPAID` and what is `PAID`, each as TA, DA and the manual reimbursements apart, and the latest `paid_at`.
   */
  statementsForRange(range: { from: string; to: string }): Promise<ExpenseStatement[]>;
  /** One conditional update: every accepted, still-`UNPAID` row of the user in the range becomes `PAID`. Returns how many. */
  payAllForUser(userId: string, range: { from: string; to: string }, by: string, at: Date): Promise<number>;
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

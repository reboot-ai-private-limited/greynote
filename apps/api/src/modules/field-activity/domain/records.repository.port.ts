import type { TransactionContext } from '@/shared/db/transaction.port.js';
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
  findById(id: string): Promise<DoctorCall | null>;
  /** One conditional update: only a still-`FAIL` / `UNVERIFIED` call becomes `OVERRIDE`. False if it no longer is (someone got there first). */
  overrideGeofence(id: string, override: GeofenceOverride): Promise<boolean>;
}
export interface ChemistCallRepositoryPort {
  create(input: Omit<ChemistCall, 'id'>, ctx: TransactionContext): Promise<ChemistCall>;
  listForDcr(dcrId: string): Promise<ChemistCall[]>;
  findById(id: string): Promise<ChemistCall | null>;
  overrideGeofence(id: string, override: GeofenceOverride): Promise<boolean>;
}
export interface FollowupRepositoryPort {
  create(input: Omit<Followup, 'id'>, ctx: TransactionContext): Promise<Followup>;
  listForDcr(dcrId: string): Promise<Followup[]>;
}
export interface ExpenseRepositoryPort {
  create(input: Omit<Expense, 'id'>, ctx: TransactionContext): Promise<Expense>;
  listForDcr(dcrId: string): Promise<Expense[]>;
}

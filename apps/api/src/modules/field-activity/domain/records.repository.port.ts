import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { ChemistCall, DoctorCall, Followup } from './call.entity.js';

export interface DoctorCallRepositoryPort {
  create(input: Omit<DoctorCall, 'id'>, ctx: TransactionContext): Promise<DoctorCall>;
  listForDcr(dcrId: string): Promise<DoctorCall[]>;
}
export interface ChemistCallRepositoryPort {
  create(input: Omit<ChemistCall, 'id'>, ctx: TransactionContext): Promise<ChemistCall>;
  listForDcr(dcrId: string): Promise<ChemistCall[]>;
}
export interface FollowupRepositoryPort {
  create(input: Omit<Followup, 'id'>, ctx: TransactionContext): Promise<Followup>;
  listForDcr(dcrId: string): Promise<Followup[]>;
}

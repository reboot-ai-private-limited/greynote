import type { ComplianceBlockEvent } from './complianceBlock.entity.js';
import type { TransactionContext } from '@/shared/db/transaction.port.js';

export interface ComplianceBlockRepositoryPort {
  findOpenByUserId(userId: string): Promise<ComplianceBlockEvent | null>;
  /** Not called by anything yet — the actual blocking trigger is Phase 6's compliance job. */
  create(input: Omit<ComplianceBlockEvent, 'id'>, ctx?: TransactionContext): Promise<ComplianceBlockEvent>;
  close(id: string, unblockedBy: string, unblockedAt: Date, ctx?: TransactionContext): Promise<void>;
}

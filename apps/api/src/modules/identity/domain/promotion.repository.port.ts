import type { Promotion } from './promotion.entity.js';

export interface PromotionRepositoryPort {
  create(input: Omit<Promotion, 'id' | 'createdAt' | 'status' | 'ctcAssignmentId' | 'appliedAt' | 'cancelledAt'>): Promise<Promotion>;
  findById(id: string): Promise<Promotion | null>;
  /** Newest first. */
  listByUser(userId: string): Promise<Promotion[]>;
  findScheduledByUser(userId: string): Promise<Promotion | null>;
}

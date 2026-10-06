import type { ManagerChange } from './managerHistory.js';

export interface ManagerHistoryRepositoryPort {
  record(input: Omit<ManagerChange, 'id' | 'createdAt'>): Promise<ManagerChange>;
  /** Oldest first. */
  listByUser(userId: string): Promise<ManagerChange[]>;
}

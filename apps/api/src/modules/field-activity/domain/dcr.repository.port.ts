import type { Dcr } from './dcr.entity.js';

export interface DcrRepositoryPort {
  /**
   * The user's DCR for that day, creating it if there is none — one atomic step, so simultaneous first
   * records of a day (two phones, two pushes) get the same row, never two.
   */
  getOrCreate(userId: string, reportDate: string): Promise<Dcr>;
  findById(id: string): Promise<Dcr | null>;
  findByUserAndDate(userId: string, reportDate: string): Promise<Dcr | null>;
  /** Both ends inclusive, newest first. */
  listForUsers(userIds: string[], from: string, to: string): Promise<Dcr[]>;
}

import type { LeaveType } from './leaveType.entity.js';

export interface LeaveTypeRepositoryPort {
  list(): Promise<LeaveType[]>;
  findById(id: string): Promise<LeaveType | null>;
  /** `null` if the name (ignoring case) is taken. */
  create(input: Omit<LeaveType, 'id'>): Promise<LeaveType | null>;
  /** `null` if the new name (ignoring case) is taken. */
  update(id: string, change: Partial<Omit<LeaveType, 'id'>>): Promise<LeaveType | null>;
  /** Adds the defaults whose names are missing; never touches existing rows. */
  seed(defaults: Array<Pick<LeaveType, 'name' | 'isPaid'>>): Promise<void>;
}

import type { LeavePolicy } from './leavePolicy.entity.js';

export interface LeavePolicyRepositoryPort {
  list(): Promise<LeavePolicy[]>;
  listForPayBand(payBandId: string): Promise<LeavePolicy[]>;
  /** Creates or replaces the (Pay Band, leave type) row. */
  upsert(input: Omit<LeavePolicy, 'id' | 'updatedAt'>): Promise<LeavePolicy>;
  existsForLeaveType(leaveTypeId: string): Promise<boolean>;
}

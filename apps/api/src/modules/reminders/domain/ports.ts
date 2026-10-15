import type { ConfigReader } from '@/shared/config/readConfig.js';

export type { ConfigReader };

/** Reminders' narrow views of the modules it reads. Each public contract satisfies its port structurally. */
export interface FieldPerson {
  id: string;
  name: string;
  designationLevel: number | null;
  managerId: string | null;
}

export interface PeoplePort {
  /** Every active FIELD employee (managers included). */
  listFieldEmployees(): Promise<FieldPerson[]>;
  getEmploymentDetails(userId: string): Promise<{ dateOfJoining: Date | null } | null>;
  isBlocked(userId: string): Promise<boolean>;
}

export interface CalendarPort {
  /** Weekly off and applicable holidays in the range. */
  listOffDates(userId: string, from: string, to: string): Promise<string[]>;
  /** Days covered by an approved (or manager-approved) leave. */
  listLeaveDates(userId: string, from: string, to: string): Promise<string[]>;
}

export interface PlansPort {
  /** `null` when there is no plan at all. */
  getDailyPlanStatus(userId: string, planDate: string): Promise<string | null>;
  getMonthlyPlanStatus(userId: string, planMonth: string): Promise<string | null>;
}

export interface ExpensesPort {
  /** Among `userIds`, who has expenses in the month but has not sent them. */
  listUnsubmittedExpenseUsers(month: string, userIds: string[]): Promise<string[]>;
}

export interface StockPort {
  /** Who has outlets with no stock count for the month (only distributor-covering employees appear). */
  listMissingStock(month: string, userIds: string[]): Promise<Array<{ userId: string }>>;
}

export interface WaitingRequest {
  kind: string;
  managerId: string;
}

export interface ApprovalsPort {
  listWaitingOnManagers(filter?: { kinds?: string[] }): Promise<WaitingRequest[]>;
}

export interface InboxPort {
  notify(
    userIds: string[],
    input: { title: string; body: string; kind: 'UPDATE' | 'REMINDER'; expiresAt?: Date; data?: Record<string, string> },
  ): Promise<number>;
}

export interface ReminderMarksPort {
  /** The keys not claimed before; each is claimed atomically, so of two servers racing exactly one gets it. */
  claim(keys: string[]): Promise<string[]>;
}

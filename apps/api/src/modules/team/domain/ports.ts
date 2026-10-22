import type { ReportsPublicContract } from '@/modules/reports/reports.public.js';

/** One person below a manager; `depth` 1 is a direct report. */
export interface DownlineEntry {
  id: string;
  employeeCode: string;
  name: string;
  managerId: string | null;
  status: 'active' | 'pending' | 'inactive';
  depth: number;
}

export interface FieldEmployeeInfo {
  id: string;
  designation: string | null;
  hqId: string | null;
  zoneId: string | null;
}

/** Team's narrow view of Identity; `identity.contract` satisfies it structurally. */
export interface TeamDirectoryPort {
  getDownline(managerId: string): Promise<DownlineEntry[]>;
  listFieldEmployees(onlyIds?: string[]): Promise<FieldEmployeeInfo[]>;
}

/** Team's narrow view of Territory; `territory.contract` satisfies it structurally. */
export interface TeamTerritoryPort {
  getHq(hqId: string): Promise<{ id: string; name: string } | null>;
  getZone(zoneId: string): Promise<{ id: string; name: string } | null>;
}

/** A route a plan names, as a manager sees it: the type says HQ, ex-station or out-station. */
export interface TeamPlanRoute {
  id: string;
  name: string;
  routeType: 'HQ' | 'EX_STATION' | 'OUT_STATION';
}

/** Team's narrow view of Territory's routes; `territory.contract` satisfies it structurally (a deleted route still answers). */
export interface TeamRoutesPort {
  getRoute(routeId: string): Promise<TeamPlanRoute | null>;
}

/** Identity's compliance block, one person at a time. */
export interface TeamBlockPort {
  isBlocked(userId: string): Promise<boolean>;
}

/** Team's narrow view of Planning; `planning.contract` satisfies it structurally. */
export interface TeamPlanningPort {
  getDailyPlanDay(
    userId: string,
    planDate: string,
  ): Promise<{
    status: string;
    workingType: string;
    routeIds: string[];
    doctorIds: string[];
    changedFromMonthly?: boolean;
  } | null>;
  getMonthlyPlanStatus(userId: string, planMonth: string): Promise<string | null>;
}

/** Team's narrow view of Field Activity; `fieldActivity.contract` satisfies it structurally. */
export interface TeamFieldActivityPort {
  getDcrSummary(
    userId: string,
    range: { from: string; to: string },
  ): Promise<
    Array<{ status: string; doctorCalls: number; chemistCalls: number; followups: number }>
  >;
}

export interface TeamLeaveEntry {
  leaveId: string;
  userId: string;
  leaveType: string | null;
  startDate: string;
  endDate: string;
  half: 'FIRST' | 'SECOND' | null;
  daysCount: number;
  status: 'SUBMITTED' | 'MANAGER_APPROVED' | 'APPROVED';
}

/** Team's narrow view of HR; `hr.contract` satisfies it structurally. */
export interface TeamHrPort {
  listLeavesForUsers(userIds: string[], from: string, to: string): Promise<TeamLeaveEntry[]>;
  listOffDates(userId: string, from: string, to: string): Promise<string[]>;
}

/** Team's narrow view of Config. */
export interface TeamConfigPort {
  get(key: string): Promise<string>;
}

/** Team's narrow view of Reports; `reports.contract` satisfies it structurally. */
export type TeamOverviewPort = Pick<ReportsPublicContract, 'readTeamOverview'>;

export interface TeamOrder {
  id: string;
  userId: string;
  outlet: { type: 'CHEMIST' | 'DISTRIBUTOR'; id: string };
  orderDate: string;
  status: 'PLACED' | 'DONE' | 'CANCELLED';
  totalAmountPaise: number;
  /** Done orders: what was delivered (free units excluded); null/absent otherwise or when no supply was recorded. */
  suppliedAmountPaise?: number | null;
  remarks: string | null;
  items: unknown[];
}

/** Team's narrow view of Sales; `sales.contract` satisfies it structurally. */
export interface TeamSalesPort {
  listOrders(filter: {
    from?: string;
    to?: string;
    status?: TeamOrder['status'];
    userId?: string;
    limit?: number;
  }): Promise<TeamOrder[]>;
  listMissingStock(
    month: string,
    userIds?: string[],
  ): Promise<
    Array<{
      userId: string;
      outlets: Array<{ type: 'CHEMIST' | 'DISTRIBUTOR'; id: string; name: string }>;
    }>
  >;
  listSecondaryStatus(
    month: string,
    userIds: string[],
  ): Promise<
    Array<{ userId: string; status: 'NOT_ENTERED' | 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' }>
  >;
}

/** Team's narrow view of Field Master Data: outlet names. */
export interface TeamMasterPort {
  listNames(query: { distributorIds?: string[]; chemistIds?: string[] }): Promise<{
    distributors: Array<{ id: string; name: string }>;
    chemists: Array<{ id: string; name: string }>;
  }>;
}

export interface WaitingRequest {
  requestId: string;
  kind: string;
  recordId: string;
  cycle: number;
  submitterId: string;
  managerId: string;
  submittedAt: Date;
  dueAt: Date;
  overdue: boolean;
}

/** Team's narrow view of Approval; `approval.contract` satisfies it structurally. */
export interface TeamApprovalPort {
  listWaitingOnManagers(filter?: {
    kinds?: string[];
    submittedFrom?: Date;
  }): Promise<WaitingRequest[]>;
}

/** Team's narrow view of Inbox; `inbox.contract` satisfies it structurally. */
export interface TeamInboxPort {
  notify(
    userIds: string[],
    input: {
      title: string;
      body: string;
      kind: 'UPDATE' | 'REMINDER';
      expiresAt?: Date | undefined;
    },
  ): Promise<number>;
}

/** Team's narrow view of Identity for naming people and finding their manager. */
export interface TeamPeoplePort {
  getUserSummaries(
    userIds: string[],
  ): Promise<Array<{ id: string; name: string; employeeCode: string; managerId: string | null }>>;
}

/** What has already been told, so a job that runs every few minutes tells each thing once. */
export interface AlertMarksPort {
  /** Records these keys and returns only the ones that were not recorded before (safe from several servers at once). */
  claim(keys: string[]): Promise<string[]>;
}

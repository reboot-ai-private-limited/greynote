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

/** A colleague as a plan names them. */
export interface NamedPerson {
  id: string;
  name: string;
  designation: string | null;
  label: string;
}

/** Team's narrow view of Identity; `identity.contract` satisfies it structurally. */
export interface TeamDirectoryPort {
  getDownline(managerId: string): Promise<DownlineEntry[]>;
  listFieldEmployees(onlyIds?: string[]): Promise<FieldEmployeeInfo[]>;
  /** Name, current designation and `Name (Designation)` label of each user, in the order given. */
  namePeople(userIds: string[]): Promise<NamedPerson[]>;
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
    /** Accompanying colleagues' user ids. */
    workWith?: string[];
    doctorIds: string[];
    changedFromMonthly?: boolean;
    remarks?: string | null;
  } | null>;
  getMonthlyPlanStatus(userId: string, planMonth: string): Promise<string | null>;
  /** The doctors on a person's approved Daily Plans in a month (up to yesterday): days planned, and the day first planned if never called since (still owed). */
  listPlannedDoctors(userId: string, planMonth: string): Promise<Array<{ doctorId: string; plannedDays: number; missedSince: string | null }>>;
  /** A person's daily plans in a range, oldest first, each with its status, routes, doctors, work with and remarks. */
  listDailyPlanDays?(
    userId: string,
    from: string,
    to: string,
  ): Promise<Array<{ date: string; status: string; workingType: string; routeIds: string[]; workWith: string[]; doctorIds: string[]; remarks: string | null; changedFromMonthly: boolean }>>;
}

/** Team's narrow view of Field Activity; `fieldActivity.contract` satisfies it structurally. */
export interface TeamFieldActivityPort {
  listServicesForDoctors(doctorIds: string[]): Promise<TeamDoctorService[]>;
  listGiftsForDoctors(doctorIds: string[]): Promise<TeamDoctorGift[]>;
  listExpenseMonthSummaries(userIds: string[], month: string): Promise<Array<{ userId: string; status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED'; taPaise: number; daPaise: number; otherPaise: number; totalPaise: number }>>;
  getDayActivity(userIds: string[], date: string): Promise<TeamDayActivity[]>;
  getActivityRange(userId: string, range: { from: string; to: string }): Promise<TeamDayActivity[]>;
  getDcrSummary(
    userId: string,
    range: { from: string; to: string },
  ): Promise<
    Array<{ status: string; doctorCalls: number; chemistCalls: number; followups: number }>
  >;
}

/** A doctor a manager reads: who holds him and how he is visited. */
export interface TeamDoctorInfo {
  id: string;
  name: string;
  specialty: string;
  clinicName: string | null;
  phone: string | null;
  address: string;
  routeId: string;
  visitFrequency: number | null;
  status: string;
}

/** A gift set aside for a doctor (Field Activity's `listGiftsForDoctors`). `DONE` = handed over. */
export interface TeamDoctorGift {
  id: string;
  doctorId: string;
  productName: string;
  amountPaise: number;
  status: 'PENDING' | 'DONE';
  allocatedAt: Date;
  completedAt: Date | null;
}

/** A service asked for a doctor, with its stage (Field Activity's `listServicesForDoctors`). */
export interface TeamDoctorService {
  id: string;
  doctorId: string;
  userId: string;
  userName?: string;
  serviceType: string;
  amountPaise: number;
  remarks: string | null;
  /** The approval status; `APPROVED` and not done = to do. */
  status: string;
  doneAt: Date | null;
  createdAt: Date;
}

/** What one person did on one day: the report's status and each call with its time (Field Activity's `getDayActivity`). */
export interface TeamDayActivity {
  userId: string;
  date: string;
  reportStatus: string | null;
  doctorCalls: Array<{ doctorId: string; recordedAt: Date; remarks: string | null; geofence: string; samples?: Array<{ productName: string; quantity: number }>; lbl?: string[] }>;
  chemistCalls: Array<{ chemistId: string; recordedAt: Date }>;
  followups: number;
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
  /** The MRs' **approved** secondary rows for a month (units issued onward); a draft, sent or rejected row never appears. */
  listSecondaryLines(filter: { fromMonth: string; toMonth: string; userIds?: string[]; limit?: number }): Promise<Array<{ userId: string; issuedQty: number }>>;
}

/** Team's narrow view of Field Master Data: outlet names. */
export interface TeamMasterPort {
  /** The doctors a person holds. */
  listAssignedDoctors(userId: string): Promise<TeamDoctorInfo[]>;
  getDoctor(doctorId: string): Promise<TeamDoctorInfo | null>;
  /** The MR who holds a doctor, or `null`. */
  getAssignedUserId(doctorId: string): Promise<string | null>;
  /** Names for doctors in one query; an id that is not there is left out. */
  getDoctorNames(doctorIds: string[]): Promise<Array<{ id: string; name: string }>>;
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

/** Team's narrow view of Attendance; `attendance.contract` satisfies it structurally. */
export interface TeamAttendancePort {
  getMonth(userId: string, month: string): Promise<{ userId: string; month: string; days: Array<{ date: string; status: string }>; counts: Record<string, number> }>;
}

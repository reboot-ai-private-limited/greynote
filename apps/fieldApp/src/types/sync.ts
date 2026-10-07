/**
 * The parts of the server's pull snapshots the app reads. Copied by hand from
 * packages/contracts/src/sync.ts (the app doesn't depend on that package) — keep in step.
 */

export type PlanStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'MANAGER_APPROVED'
  | 'APPROVED'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'REOPENED';

export type PlanningSnapshot = {
  /** Today's date in the business timezone, as of the pull. */
  today: string;
  dailyPlans: {
    id: string;
    planDate: string;
    workingType: 'FIELD_WORK' | 'MEETING' | 'CONFERENCE' | 'STRIKE';
    workWith: string[];
    routeIds: string[];
    remarks: string | null;
    status: PlanStatus;
    approvalRequestId: string | null;
    submitDeadline: string;
  }[];
  monthlyPlans: {
    id: string;
    planMonth: string;
    entries: {
      planDate: string;
      workingType: 'FIELD_WORK' | 'MEETING' | 'CONFERENCE' | 'STRIKE';
      workWith: string[];
      routeIds: string[];
      remarks: string | null;
    }[];
    status: PlanStatus;
    approvalRequestId: string | null;
    submitDeadline: string;
  }[];
};

export type FieldActivitySnapshot = {
  /** Compliance block: missed reports with no approved leave. Only an Admin clears it. */
  blocked: boolean;
  today: string;
};

export type ConfigSnapshot = { settings: Record<string, string> };

export type TerritorySnapshot = {
  routes: {
    id: string;
    name: string;
    hqId: string;
    hqName: string;
    routeType: 'HQ' | 'EX_STATION' | 'OUT_STATION';
    distanceKm: string | null;
  }[];
  hq: { hqId: string; hqName: string; zoneId: string; zoneName: string } | null;
};

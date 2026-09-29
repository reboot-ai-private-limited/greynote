/**
 * The wire format of offline sync (docs/LLD/sync.md), shared by `apps/api` and the phone. Dates are ISO
 * 8601 strings with a timezone. Money is whole paise. `apps/api` builds its responses against these
 * types, so a field renamed here is a compile error there and in the app.
 */
import type { GeoPoint } from './geofence.js';
import type { HttpSuccessBody } from './http.js';

// ---- Push: the daily report's Submit -----------------------------------------------------------

/** One record the phone sends at Submit. */
export interface SyncRecord<Kind extends string = string, Payload = unknown> {
  /** The phone's own UUID for it, made when the record was created — what makes a retry safe. */
  clientId: string;
  kind: Kind;
  /** Client ids of the records that must be applied first. A record whose parent failed fails too. */
  dependsOn: string[];
  /** When the MR made it on the phone; cutoffs are judged on this (sign-off G3). */
  clientCreatedAt: string;
  payload: Payload;
}

export interface SyncPushRequest {
  /** At most `SYNC_MAX_BATCH` (100): send a bigger day in chunks, the DCR's own submit in the last one. */
  records: SyncRecord[];
}

export const SYNC_RESULT_STATUSES = ['SYNCED', 'ALREADY_SYNCED', 'FAILED'] as const;
export type SyncResultStatus = (typeof SYNC_RESULT_STATUSES)[number];

/** Why a record failed: a code the app acts on, and a message the MR can read. */
export interface SyncReason {
  code: string;
  message: string;
}

/** One record's outcome. There is one per record sent, in the order sent — never one verdict for the batch. */
export interface SyncRecordResult {
  clientId: string;
  status: SyncResultStatus;
  /** The id of what the server created (or already had). */
  serverId?: string;
  reason?: SyncReason;
}

export interface SyncPushResponse {
  results: SyncRecordResult[];
  summary: { synced: number; alreadySynced: number; failed: number };
}

/**
 * The codes the sync engine itself answers with; a kind's handler adds its own (below).
 * `INTERNAL` means "try Submit again"; `DEPENDENCY_FAILED` means a parent *in this batch* failed — fix it
 * first; `INVALID_DEPENDENCY` means a parent that is neither in this batch nor already synced (never sent, a
 * loop, or — across chunks — a parent that failed earlier: the server only knows what synced, so send parents
 * first and hold back the children of one that failed); `UNKNOWN_KIND` means the app is older than the
 * server; the rest name a problem with the record for the MR to fix.
 */
export const SYNC_ENGINE_CODES = ['DEPENDENCY_FAILED', 'INVALID_DEPENDENCY', 'UNKNOWN_KIND', 'CLIENT_TIME_INVALID', 'INTERNAL'] as const;

/** The record kinds the server accepts today; Phase 6 adds the calls, expenses, orders, gifts, services and the DCR submit. */
export const SYNC_RECORD_KINDS = ['NEW_DOCTOR'] as const;
export type SyncRecordKind = (typeof SYNC_RECORD_KINDS)[number];

/** A Doctor the MR added offline (the same fields as `POST /field-master-data/doctors/added`, minus the client id). */
export interface NewDoctorPayload {
  routeId: string;
  category: string;
  name: string;
  address: string;
  specialty: string;
  qualification: string;
  email?: string | null;
  /** The phone's GPS when adding. */
  location: GeoPoint;
}
export type NewDoctorSyncRecord = SyncRecord<'NEW_DOCTOR', NewDoctorPayload>;

/** What `NEW_DOCTOR` refuses with, beyond the engine's codes. */
export const NEW_DOCTOR_REASON_CODES = ['INVALID_PAYLOAD', 'ROUTE_NOT_ASSIGNED', 'ADDED_AT_THE_SAME_TIME'] as const;

// ---- Draft backup ------------------------------------------------------------------------------

/** A draft to keep, or a removal (`deleted: true`, which needs no kind or payload). */
export type SyncDraftUpload =
  | { clientId: string; clientUpdatedAt: string; deleted?: false; kind: string; payload: unknown }
  | { clientId: string; clientUpdatedAt: string; deleted: true };

export interface SyncPutDraftsRequest {
  drafts: SyncDraftUpload[];
}

export const SYNC_DRAFT_STATUSES = ['STORED', 'STALE', 'SUBMITTED', 'REJECTED'] as const;
export type SyncDraftStatus = (typeof SYNC_DRAFT_STATUSES)[number];

export interface SyncDraftResult {
  clientId: string;
  status: SyncDraftStatus;
  reason?: SyncReason;
}

export interface SyncPutDraftsResponse {
  results: SyncDraftResult[];
  summary: { stored: number; stale: number; submitted: number; rejected: number };
}

export const SYNC_DRAFT_REASON_CODES = ['DRAFT_TOO_LARGE', 'DRAFT_LIMIT_REACHED', 'CLIENT_TIME_INVALID'] as const;

export interface SyncDraft {
  clientId: string;
  kind: string;
  clientUpdatedAt: string;
  payload: unknown;
}

export interface SyncDraftsPage {
  drafts: SyncDraft[];
  /** Pass as `after` for the next page; `null` on the last. */
  nextCursor: string | null;
}

// ---- Pull: the phone's reference data ----------------------------------------------------------

export const SYNC_SOURCE_NAMES = ['config', 'fieldMasterData', 'hr', 'planning', 'territory'] as const;
export type SyncSourceName = (typeof SYNC_SOURCE_NAMES)[number];

export type SyncSourceResult<Data> =
  | { version: string; unchanged: true }
  | { version: string; data: Data }
  | { error: { code: string; message: string } };

export interface SyncPullResponse {
  /** The server's clock, so the phone can tell how far its own is off. */
  serverTime: string;
  sources: {
    config?: SyncSourceResult<ConfigSnapshot>;
    fieldMasterData?: SyncSourceResult<FieldMasterDataSnapshot>;
    hr?: SyncSourceResult<HrSnapshot>;
    planning?: SyncSourceResult<PlanningSnapshot>;
    territory?: SyncSourceResult<TerritorySnapshot>;
  };
}

export interface ConfigSnapshot {
  /** Setting key → value, as text. */
  settings: Record<string, string>;
}

export interface FieldMasterDataSnapshot {
  doctors: Array<{
    id: string;
    routeId: string;
    category: string;
    name: string;
    address: string;
    email: string | null;
    specialty: string;
    qualification: string;
    location: GeoPoint | null;
  }>;
  /** Doctors the MR added that are still waiting for approval. */
  pendingDoctors: Array<{
    id: string;
    routeId: string;
    category: string;
    name: string;
    address: string;
    specialty: string;
    qualification: string;
    location: GeoPoint | null;
  }>;
  chemists: Array<{ id: string; routeId: string; name: string; address: string; location: GeoPoint | null }>;
  distributors: Array<{
    id: string;
    routeId: string;
    name: string;
    gstNumber: string;
    contactPerson: string;
    mobile: string;
    address: string;
    location: GeoPoint | null;
    primarySalesEnabled: boolean;
    secondarySalesEnabled: boolean;
  }>;
  products: Array<{ id: string; name: string; sku: string; category: string }>;
  sampleAllocations: Array<{ id: string; doctorId: string; productId: string; quantityAllocated: number; quantityRemaining: number }>;
}

export interface TerritorySnapshot {
  routes: Array<{
    id: string;
    name: string;
    areaId: string;
    areaName: string;
    areaType: 'HQ' | 'EX_STATION' | 'OUT_STATION';
    /** Decimal kilometres as text; `null` when the distance could not be calculated. */
    distanceKm: string | null;
    distanceStatus: 'CALCULATED' | 'FAILED';
    /** Paise per km. */
    taPerKmRateOverridePaise: number | null;
  }>;
  hq: { hqId: string; hqName: string; zoneId: string; zoneName: string } | null;
}

export interface HrSnapshot {
  leaveYear: number;
  leaveYearFrom: string;
  leaveYearTo: string;
  weeklyOffDay: string;
  leaveBackdateDays: number;
  leaveTypes: Array<{ id: string; name: string; isPaid: boolean }>;
  balances: Array<{ leaveTypeId: string; leaveTypeName: string; allocatedDays: number; usedDays: number; pendingDays: number; availableDays: number }>;
  holidays: Array<{ name: string; date: string; scope: 'NATIONAL' | 'ZONE' | 'HQ' }>;
}

export const PLAN_STATUSES = ['DRAFT', 'SUBMITTED', 'MANAGER_APPROVED', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'REOPENED'] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];
export type WorkingType = 'FIELD_WORK' | 'MEETING' | 'CONFERENCE' | 'STRIKE';

export interface PlanningSnapshot {
  /** Today's date in the business timezone. */
  today: string;
  dailyPlans: Array<{
    id: string;
    planDate: string;
    workingType: WorkingType;
    workWith: string[];
    routeIds: string[];
    remarks: string | null;
    revision: number;
    status: PlanStatus;
    approvalRequestId: string | null;
    submitDeadline: string;
  }>;
  monthlyPlans: Array<{
    id: string;
    planMonth: string;
    entries: Array<{ planDate: string; workingType: WorkingType; workWith: string[]; routeIds: string[]; remarks: string | null }>;
    revision: number;
    status: PlanStatus;
    approvalRequestId: string | null;
    submitDeadline: string;
  }>;
}

/** The enveloped responses, as the phone receives them. */
export type SyncPushHttpResponse = HttpSuccessBody<SyncPushResponse>;
export type SyncPutDraftsHttpResponse = HttpSuccessBody<SyncPutDraftsResponse>;
export type SyncDraftsHttpResponse = HttpSuccessBody<SyncDraftsPage>;
export type SyncPullHttpResponse = HttpSuccessBody<SyncPullResponse>;

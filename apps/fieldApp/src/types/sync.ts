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

export type WorkingTypeName = 'FIELD_WORK' | 'DOCTOR_CAMPAIGN' | 'MEETING' | 'CONFERENCE' | 'STRIKE';

/**
 * A day locked on the Monthly Plan (docs/mobile/monthlyplan.md rule 18): the weekly off, or a holiday of the main HQ.
 * `name` is the holiday's name (several joined with " / "), null for a weekly off.
 */
export type PlanOffDay = { date: string; reason: 'WEEKLY_OFF' | 'HOLIDAY'; name: string | null };

export type PlanningSnapshot = {
  /** Today's date in the business timezone, as of the pull. */
  today: string;
  /** This and next month's locked days. Absent from older servers, which lock only the weekly off day. */
  planOffDays?: PlanOffDay[];
  dailyPlans: {
    id: string;
    planDate: string;
    workingType: WorkingTypeName;
    workWith: string[];
    routeIds: string[];
    /** The doctors to call: the MR's picks plus missed calls carried over (`carriedFrom` = the day first planned). Absent from older servers. */
    doctors?: { doctorId: string; carriedFrom: string | null }[];
    /** A trip day the server wrote from the Tour Plan's `returnDate`. Absent from older servers. */
    dayKind?: 'NORMAL' | 'STAY' | 'TRANSIT';
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
      workingType: WorkingTypeName;
      workWith: string[];
      routeIds: string[];
      remarks: string | null;
      /** On a trip's first day: the day the employee comes back. Absent from older servers. */
      returnDate?: string | null;
      /** `STAY` / `TRANSIT` for the days the server wrote for an out-station trip. Absent from older servers. */
      dayKind?: 'NORMAL' | 'STAY' | 'TRANSIT';
    }[];
    status: PlanStatus;
    approvalRequestId: string | null;
    submitDeadline: string;
  }[];
};

export type FieldActivitySnapshot = {
  /** Compliance block: a missed daily report. Admin or a manager above the employee clears it, with a reason. */
  blocked: boolean;
  today: string;
  /** The last week's daily reports, oldest first. */
  dcrs?: { id: string; reportDate: string; status: PlanStatus; approvalRequestId?: string | null; doctorCalls: number; chemistCalls: number; followups: number }[];
  /** The MR's own Doctor Services, newest first (an Admin-made one is APPROVED). */
  doctorServices?: {
    id: string;
    doctorId: string;
    serviceType: DoctorServiceType;
    amountPaise: number;
    remarks: string | null;
    origin: 'MR' | 'ADMIN';
    status: PlanStatus;
    approvalRequestId: string | null;
  }[];
  /** Gifts for the MR's doctors still to be given, newest first. */
  pendingGifts?: { id: string; doctorId: string; productName: string; amountPaise: number }[];
};

export type DoctorServiceType = 'TOUR_PACKAGE' | 'GIFT' | 'ONLINE_PROMOTION' | 'OTHERS';

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

export type GeoPoint = { latitude: number; longitude: number };

/** What the Dr Call and Chemist Call screens read from the `fieldMasterData` pull source. */
export type FieldMasterDataSnapshot = {
  doctors: {
    id: string;
    routeId: string;
    name: string;
    address: string;
    email: string | null;
    /** The clinic or hospital, and a contact number; `null` when not set (absent from older servers). */
    clinicName?: string | null;
    phone?: string | null;
    specialty: string;
    qualification: string;
    location: GeoPoint | null;
    /** `YYYY-MM-DD`, optional. */
    dateOfBirth?: string | null;
    anniversary?: string | null;
    /** How many visits a month the MR should make (1–4); `null` = no target. */
    visitFrequency?: number | null;
    /** The doctor's photo, or `null` (show initials). Absent from older servers. */
    photoUrl?: string | null;
  }[];
  chemists: { id: string; routeId: string; name: string; address: string; location: GeoPoint | null }[];
  /** A distributor can be on several routes (the API sends `routeIds`; there is no single `routeId`). */
  distributors?: { id: string; routeIds: string[]; name: string; address: string; location: GeoPoint | null }[];
  products: {
    id: string;
    name: string;
    sku: string;
    packSize: string | null;
    ptsPaise?: number | null;
    ptrPaise?: number | null;
    mrpPaise?: number | null;
  }[];
  /** The specialities the server accepts for a doctor, A–Z. */
  specialties: string[];
  sampleAllocations: { id: string; doctorId: string; productId: string; quantityAllocated: number; quantityRemaining: number }[];
};

/** What the Leave screen reads from the `hr` pull source (balances show offline from the last pull). */
export type HrSnapshot = {
  leaveYear: number;
  /** How many days back a leave may start. */
  leaveBackdateDays: number;
  leaveTypes: { id: string; name: string; isPaid: boolean }[];
  balances: {
    leaveTypeId: string;
    leaveTypeName: string;
    allocatedDays: number;
    usedDays: number;
    pendingDays: number;
    availableDays: number;
  }[];
};

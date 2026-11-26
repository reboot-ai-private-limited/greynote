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
  /** Doctors still owed from earlier days (planned, not called since), worked out by the server at every pull; callable today on any route. Absent from older servers. */
  owedDoctors?: { doctorId: string; carriedFrom: string }[];
  /** This and next month's locked days. Absent from older servers, which lock only the weekly off day. */
  planOffDays?: PlanOffDay[];
  dailyPlans: {
    id: string;
    planDate: string;
    workingType: WorkingTypeName;
    workWith: string[];
    routeIds: string[];
    /** Where the day starts and ends (2026-11-26); absent on older days. */
    fromPlaceId?: string | null;
    toPlaceId?: string | null;
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
    /** Days nobody can change any more (over, or their Daily Plan has gone to approval). Absent from older servers. */
    lockedDays?: string[];
    /** Approved at some point, so a reopened or re-sent month still lets the days already approved be worked. Absent from older servers. */
    wasApproved?: boolean;
    entries: {
      planDate: string;
      workingType: WorkingTypeName;
      workWith: string[];
      routeIds: string[];
      /** Where the day starts and ends (2026-11-26); absent on older days. */
      fromPlaceId?: string | null;
      toPlaceId?: string | null;
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

/** The five a new request can be (2026-11-19) and the two older ones, which stay on old rows. */
export type DoctorServiceType = 'HONORARIUM' | 'CME' | 'TRAINING' | 'ONLINE_PROMOTION' | 'OTHERS' | 'TOUR_PACKAGE' | 'GIFT';

export type ConfigSnapshot = { settings: Record<string, string> };

export type TerritorySnapshot = {
  routes: {
    id: string;
    name: string;
    hqId: string;
    hqName: string;
    routeType: 'HQ' | 'EX_STATION' | 'OUT_STATION';
    distanceKm: string | null;
    /** Both ends of the route (2026-11-26; a route serves both ways). Absent from older servers. */
    fromPlaceId?: string | null;
    toPlaceId?: string | null;
  }[];
  /** The places of the HQ you are based in, HQ town first (2026-11-26): what your From and To are picked from. Absent from older servers. */
  places?: PlaceRow[];
  hq: { hqId: string; hqName: string; zoneId: string; zoneName: string } | null;
};

/** A town or station under an HQ. `type` is the DA a day there pays that HQ's own people. */
export type PlaceRow = { id: string; hqId: string; hqName?: string; name: string; type: 'HQ' | 'EX_STATION' | 'OUT_STATION'; isHqTown: boolean };

export type GeoPoint = { latitude: number; longitude: number };

/** What the Dr Call and Chemist Call screens read from the `fieldMasterData` pull source. */
export type FieldMasterDataSnapshot = {
  doctors: {
    id: string;
    routeId: string;
    /** Where it sits (2026-11-26): a day whose To place is this one offers it. Absent from older servers. */
    placeId?: string;
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
  /** Doctors I added that are still waiting for approval. Absent from older servers. */
  pendingDoctors?: {
    id: string;
    routeId: string;
    /** Where it sits (2026-11-26): a day whose To place is this one offers it. Absent from older servers. */
    placeId?: string;
    name: string;
    address: string;
    specialty: string;
    qualification: string;
    location: GeoPoint | null;
    photoUrl: string | null;
  }[];
  /** `phone` is `null` when not set (absent from older servers). */
  chemists: { id: string; routeId: string; name: string; address: string; phone?: string | null; location: GeoPoint | null }[];
  /** A distributor can be on several routes (the API sends `routeIds`; there is no single `routeId`). */
  distributors?: { id: string; routeIds: string[]; name: string; address: string; location: GeoPoint | null; gstNumber?: string | null; contactPerson?: string | null; mobile?: string | null }[];
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

/** A weekday that is off every week (`ALL`) or only in some occurrences (`[1, 3]`: the 1st Saturday is the Saturday on day 1-7). */
export type WeeklyOffRule = { weekday: string; weeks: 'ALL' | number[] };
export type WeeklyOffVersion = { effectiveFrom: string; rules: WeeklyOffRule[] };

/** What the Leave screen reads from the `hr` pull source (balances show offline from the last pull). */
export type HrSnapshot = {
  leaveYear: number;
  /** How many days back a leave may start. The server now always sends 366 (2026-11-02): use `leaveYearFrom` instead. */
  leaveBackdateDays: number;
  /** First and last day of the leave year (absent from an older server). A leave may start any day from `leaveYearFrom`, the past included. */
  leaveYearFrom?: string;
  leaveYearTo?: string;
  /** The one weekday that is off every week today (absent from an older server). */
  weeklyOffDay?: string;
  /** The weekly-off rule sets, each from its start date (absent from an older server). */
  weeklyOffSchedule?: WeeklyOffVersion[];
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

/**
 * System settings over HTTP. The Admin screen is built from `GET /config`: each setting carries its own type, limits, default and
 * impact, so the screen needs no list of keys of its own.
 */
export const CONFIG_TYPES = ['BOOLEAN', 'INTEGER', 'TIME', 'MONTH', 'WEEKDAY', 'TIMEZONE', 'KIND_LIST'] as const;
export type ConfigType = (typeof CONFIG_TYPES)[number];

/** `HIGH` changes how the system reads dates or who can act: the screen asks for a deliberate confirmation first. */
export type ConfigImpact = 'NORMAL' | 'HIGH';

export interface ConfigSettingDto {
  key: string;
  /** The module that reads it, e.g. `PLANNING`. */
  module: string;
  /** A name for the group: "Planning", "Phone sync". */
  moduleLabel: string;
  label: string;
  description: string;
  type: ConfigType;
  /** INTEGER only: inclusive limits. */
  min: number | null;
  max: number | null;
  /** A word for the number: `days`, `minutes`, `meters`. */
  unit: string | null;
  /** The names a MONTH or WEEKDAY setting chooses from. */
  options: string[] | null;
  default: string;
  impact: ConfigImpact;
  /** What moves when a HIGH setting changes. */
  impactNote: string | null;
  /** What is stored, exactly. */
  value: string;
  isDefault: boolean;
  /** False when the stored value breaks its own rules (an older one, from before they were checked): the system would fail reading it. */
  valid: boolean;
  invalidReason: string | null;
  /** The Admin who last changed it; `null` while it is the seeded default. */
  updatedBy: string | null;
  updatedAt: string;
}

/** Body of `PATCH /config/:key`. The server checks it against the setting's rules and stores it in the form the readers expect. */
export interface UpdateConfigDto {
  value: string;
}

/** `GET /config/public`, for any signed-in user: what a client needs to read dates as the server does. */
export interface PublicConfigDto {
  /** 1 to 12: `4` for an April start. */
  financialYearStartMonth: number;
  /** An IANA name, e.g. `Asia/Kolkata`. */
  businessTimezone: string;
  /** `HH:mm`: when the business day rolls over, e.g. `02:00`. */
  dayStartTime: string;
  /** Start years of the financial years an Admin has closed; the phone makes its daily work read-only for these. */
  closedFinancialYears: number[];
}

/** `GET /config/financial-year` (Admin): which financial years are closed, and which ended ones can still be closed. Years are named by the year they start in (2025 = 2025-26). */
export interface FinancialYearCloseDto {
  currentYear: number;
  /** Oldest first. */
  closedYears: number[];
  /** Ended years not yet closed, newest first. */
  closableYears: number[];
}

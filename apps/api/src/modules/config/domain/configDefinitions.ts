import { DEFAULT_PTAX_SLABS, parseSlabs, serialiseSlabs } from '@greynote/contracts';
import { MONTH_NAMES, WEEKDAY_NAMES, assertTimeZone, parseTimeOfDay } from '@/shared/time/businessTime.js';

/**
 * Every Admin-editable setting, in one place: what it is called, what it is, the type and limits a value must meet, its default,
 * and whether changing it needs care. The seed, the settings screen and the write-time validation all read this, so they cannot
 * drift apart.
 *
 * The limits here are the ones each reader enforces when it parses the value (`readConfig` throws a fault for anything else), so
 * a value this accepts is one the system will accept when it reads it back. Change a reader's limit and change it here too: a test
 * checks that every default passes its own definition, and the readers' own tests cover their side.
 */
export const CONFIG_TYPES = ['BOOLEAN', 'INTEGER', 'TIME', 'MONTH', 'WEEKDAY', 'TIMEZONE', 'KIND_LIST', 'YEAR_LIST', 'SLAB_LIST'] as const;
export type ConfigType = (typeof CONFIG_TYPES)[number];

export const CONFIG_IMPACTS = ['NORMAL', 'HIGH'] as const;
export type ConfigImpact = (typeof CONFIG_IMPACTS)[number];

export interface ConfigDefinition {
  key: string;
  /** The module that reads it: groups the settings on the screen. */
  module: string;
  label: string;
  description: string;
  type: ConfigType;
  /** What the seed writes, and what "reset to default" restores. Always a value its own rules accept. */
  default: string;
  /** INTEGER only: inclusive limits. */
  min?: number;
  max?: number;
  /** A word for the number: `days`, `minutes`, `meters`, `bytes`. */
  unit?: string;
  /** `HIGH` changes how the whole system reads dates or who can act, so the screen asks for a deliberate confirmation. */
  impact: ConfigImpact;
  /** What moves when a `HIGH` setting changes, said before it does. */
  impactNote?: string;
  /**
   * Set when the value is not edited as a setting but through its own action (the financial-year close). Such a setting is left off
   * the settings list and refused by `PATCH /config/:key`; the string is what the refusal says.
   */
  managedBy?: string;
}

const integer = (
  key: string,
  module: string,
  label: string,
  description: string,
  def: number,
  min: number,
  max: number,
  unit?: string,
): ConfigDefinition => ({ key, module, label, description, type: 'INTEGER', default: String(def), min, max, ...(unit && { unit }), impact: 'NORMAL' });

const toggle = (key: string, module: string, label: string, description: string, def: boolean): ConfigDefinition => ({
  key,
  module,
  label,
  description,
  type: 'BOOLEAN',
  default: String(def),
  impact: 'NORMAL',
});

export const CONFIG_DEFINITIONS: readonly ConfigDefinition[] = [
  // ── Planning ──
  { key: 'DAILY_PLAN_SUBMIT_CUTOFF_TIME', module: 'PLANNING', label: 'Daily plan deadline', description: 'Time of day by which a Daily Plan must be submitted.', type: 'TIME', default: '10:00', impact: 'NORMAL' },
  integer('MONTHLY_PLAN_SUBMIT_CUTOFF_DATE', 'PLANNING', 'Monthly plan deadline day', 'Day of the month by which a Monthly Plan must be submitted.', 28, 1, 31),
  toggle('LATE_PLAN_GRANT_BY_MANAGER', 'PLANNING', 'Managers can allow late plans', 'Whether a manager (not just Admin) may let someone in their team submit a Plan after its deadline.', false),
  integer('LATE_PLAN_GRANT_VALID_HOURS', 'PLANNING', 'Late-submission exception lasts', 'Hours a late-submission exception stays usable after it is granted.', 24, 1, 744, 'hours'),
  integer('LATE_PLAN_GRANT_MAX_HOURS', 'PLANNING', 'Longest late-submission exception', 'The furthest ahead (in hours from now) an Admin or manager can set the end of a late-submission exception.', 744, 1, 8760, 'hours'),
  integer('DAILY_PLAN_RESUBMIT_GRACE_MINUTES', 'PLANNING', 'Daily plan resubmit window', 'After a rejection, minutes a Daily Plan may still be resubmitted past its deadline.', 30, 1, 1440, 'minutes'),
  { key: 'DAILY_PLAN_RESUBMIT_LATEST_TIME', module: 'PLANNING', label: 'Latest daily plan resubmit time', description: 'Time of day on the plan date after which a rejected Daily Plan can no longer be resubmitted.', type: 'TIME', default: '11:30', impact: 'NORMAL' },
  integer('MONTHLY_PLAN_RESUBMIT_GRACE_HOURS', 'PLANNING', 'Monthly plan resubmit window', 'After a rejection, hours a Monthly Plan may still be resubmitted past its deadline (never after the month starts).', 24, 1, 744, 'hours'),
  integer('MANAGER_PLAN_DOCTORS_MAX', 'PLANNING', 'Most doctors on a manager’s day', 'Most doctors a manager’s Daily Plan may list. A manager’s list is built from the team members they work with, so it can be longer than an MR’s 50.', 100, 50, 500),
  integer('PLAN_RESUBMIT_GRACE_MAX', 'PLANNING', 'Most resubmits per plan', 'Most resubmits per Plan allowed through the after-rejection window. 0 switches the window off.', 2, 0, 99),

  // ── HR ──
  integer('LEAVE_BACKDATE_DAYS', 'HR', 'Leave backdating limit', 'How many days back a leave may start. 0: a leave starts today or later, because a leave can only be approved until its first day.', 0, 0, 366, 'days'),
  integer('LATE_LEAVE_GRANT_VALID_HOURS', 'HR', 'Late-leave exception lasts', 'Hours an Admin exception that lets a started leave be approved stays usable after it is granted.', 24, 1, 744, 'hours'),
  integer('LATE_LEAVE_GRANT_MAX_HOURS', 'HR', 'Longest late-leave exception', 'The furthest ahead (in hours from now) Admin can set the end of a late-leave exception.', 168, 1, 8760, 'hours'),

  toggle('PROBATION_LEAVE_PAID', 'HR', 'Leave is paid during probation', 'Whether unpaid leave taken during an employee’s probation is paid anyway (no salary deduction). Off: probation is treated like any other time.', true),
  integer('PROBATION_MONTHS', 'HR', 'Probation length', 'Months of probation from the joining date, unless the employee has their own length set.', 6, 0, 36, 'months'),

  // ── Territory ──
  integer('EX_STATION_MIN_KM', 'TERRITORY', 'Ex-station from', 'A Route longer than this many km from its HQ is suggested as Ex-station. Whoever creates a Route may still choose another type; they are warned, not blocked.', 15, 1, 5000, 'km'),
  integer('OUT_STATION_MIN_KM', 'TERRITORY', 'Out-station from', 'A Route longer than this many km from its HQ is suggested as Out-station. Must be more than the Ex-station distance.', 50, 2, 5000, 'km'),

  // ── Field master data ──
  toggle('DOCTOR_VISIBILITY_FOLLOWS_ROUTE', 'FIELD_MASTER_DATA', 'Doctors follow the MR’s routes', 'Whether an MR sees only the assigned Doctors on the Routes they currently have. Off: an MR keeps every assigned Doctor after a Route change.', true),
  toggle('AUTO_ASSIGN_DOCTOR_ON_APPROVAL', 'FIELD_MASTER_DATA', 'Assign a new doctor to the MR who added it', 'Whether approving a Doctor an MR added assigns that Doctor to the MR who added it.', true),
  integer('NEW_DOCTOR_COVERAGE_WAIT_DAYS', 'FIELD_MASTER_DATA', 'New doctor coverage wait', 'Days after approval before a new Doctor counts toward an MR’s coverage.', 8, 0, 365, 'days'),

  // ── Devices ──
  integer('MAX_REGISTERED_DEVICES_FIELD', 'AUTH', 'Phones per field employee', 'Max devices (registered + awaiting approval) for a FIELD-role user.', 2, 1, 10),
  integer('REJECTED_DEVICE_TTL_DAYS', 'AUTH', 'Rejected phone blocked for', 'Days a device rejected by Admin stays blocked before it can request approval again.', 7, 1, 365, 'days'),

  // ── Field activity ──
  integer('GEO_FENCE_RADIUS_METERS', 'FIELD_ACTIVITY', 'Geofence radius', 'Radius, in meters, a Dr/Chemist Call must be logged within.', 100, 1, 100_000, 'meters'),
  integer('GEO_MAX_ACCURACY_METERS', 'FIELD_ACTIVITY', 'Least accurate GPS reading trusted', 'A GPS reading less accurate than this (in meters) can’t confirm or refute a call’s location: the check is UNVERIFIED.', 100, 1, 100_000, 'meters'),
  {
    ...toggle('DCR_MISS_BLOCK_ENABLED', 'FIELD_ACTIVITY', 'Block employees who miss daily reports', 'Whether missing DCR submissions triggers the compliance block.', true),
    impact: 'HIGH',
    impactNote: 'Turning this off stops blocking anyone who misses a daily report, from the next check onward. Turning it on can block employees who have already missed days.',
  },
  {
    ...toggle('DCR_APPROVAL_REQUIRED', 'FIELD_ACTIVITY', 'Daily reports need approval', 'Whether a submitted DCR waits for the manager (and Admin) to approve it. Off: a DCR is approved the moment it is submitted and its TA/DA is generated then.', true),
    impact: 'HIGH',
    impactNote: 'Applies to reports submitted from now on. Off: nobody reviews a daily report before its TA/DA is generated. Reports already waiting keep their current approval path.',
  },
  { key: 'TEAM_NOT_STARTED_AFTER', module: 'FIELD_ACTIVITY', label: 'Manager sees “not started” after', description: 'Time of day after which a field employee with no calls or follow-ups logged for the day shows as “not started” on their manager’s Team screen. Display only: nothing is blocked or flagged to anyone else.', type: 'TIME', default: '11:00', impact: 'NORMAL' },
  integer('DCR_MISS_GRACE_DAYS', 'FIELD_ACTIVITY', 'Missed-report grace', 'Missed working days allowed before the compliance block. Set 0 for the rule "a daily report not submitted by the next day start blocks the employee until a manager or Admin unblocks them"; the seeded 1 allows one miss.', 1, 0, 365, 'days'),

  toggle('CALL_CARRY_OVER_FOREVER', 'FIELD_ACTIVITY', 'Missed calls carry over without limit', 'Whether a doctor planned for a day but not called stays on later days\u2019 plans until called. Off: the days setting below applies.', false),
  integer('CALL_CARRY_OVER_DAYS', 'FIELD_ACTIVITY', 'Missed calls carry over for', 'How long a planned but uncalled doctor carries over to later days\u2019 plans. 0 = until the end of that month; otherwise that many days after the planned day. Ignored while the setting above is on.', 0, 0, 365, 'days'),

  integer('TA_MAX_KM', 'FIELD_ACTIVITY', 'Most km paid as TA in a day', 'The km paid as TA across all of a day’s Routes together never exceeds this. Km beyond it are not paid.', 99, 1, 5000, 'km'),

  // ── Salary and payouts ──
  integer('SALARY_RUN_DAY', 'PAYROLL', 'Salary day', 'Day of the month the salary for the month just ended is run (1 = the 1st). Only drives the "due" flag on the payroll screen; nothing is refused for being early or late.', 1, 1, 28),
  integer('EXPENSE_SUBMIT_CUTOFF_DAY', 'PAYROLL', 'Expense submit deadline day', 'Day of the next month by which an employee must send a month of expenses for approval (7 = the 7th of the following month). After it, only an Admin (or manager, if allowed) exception lets the month be sent.', 7, 1, 28),
  integer('EXPENSE_APPROVAL_CUTOFF_DAY', 'PAYROLL', 'Expense approval deadline day', 'Day of the next month by which a manager must approve a submitted month of expenses (10 = the 10th of the following month). After it, only an exception lets the approval go through. Must not be earlier than the submit deadline day.', 10, 1, 28),
  toggle('LATE_EXPENSE_GRANT_BY_MANAGER', 'PAYROLL', 'Managers can allow late expenses', 'Whether a manager (not just Admin) may let someone in their team send or approve a month of expenses after its deadline. Never possible once any of the month has been paid.', false),
  integer('LATE_EXPENSE_GRANT_VALID_HOURS', 'PAYROLL', 'Late-expense exception lasts', 'Hours a late-expense exception stays usable after it is granted.', 24, 1, 744, 'hours'),
  integer('LATE_EXPENSE_GRANT_MAX_HOURS', 'PAYROLL', 'Longest late-expense exception', 'The furthest ahead (in hours from now) an Admin or manager can set the end of a late-expense exception.', 168, 1, 8760, 'hours'),
  integer('EXPENSE_PAYOUT_DAY','PAYROLL', 'Expense payout day', 'Day of the month TA, DA and reimbursements of the month just ended are paid (15 = the 15th). Only drives the "due" and "overdue" flags; nothing is refused for being early or late.', 15, 1, 28),

  toggle('ABSENT_DEDUCTS_SALARY', 'PAYROLL', 'Absent days reduce salary', 'Whether a working day with no submitted report, no approved leave and no strike is deducted from salary, like an unpaid-leave day (monthly base ÷ 30). Off: absent days are shown on the calendar but never deducted.', true),
  toggle('STRIKE_DEDUCTS_SALARY', 'PAYROLL', 'Strike days reduce salary', 'Whether a day the approved plan marks as Strike is deducted from salary like an absent day. Off (the default): a strike day costs no salary. Only matters while absent days are deducted.', false),

  toggle('LEAVE_LOCKED_AFTER_PAYROLL', 'PAYROLL', 'Lock leave once salary is finalized', 'Whether an employee\'s leave in a month can still change (be requested, edited, approved or reopened) after their salary run for that month is finalized. Daily reports and expenses are never locked by this.', true),

  integer('ESI_WAGE_CEILING', 'PAYROLL', 'ESI wage ceiling', 'Monthly gross (salary) at or below which an employee is covered by ESI. Payroll warns, and never blocks, when such an employee has no ESI number.', 21000, 1, 1_000_000, '₹'),
  {
    key: 'PTAX_SLABS',
    module: 'PAYROLL',
    label: 'Professional tax slabs',
    description: 'Professional tax taken from the monthly salary, by band of the total monthly salary (gross). A monthly salary below the first band pays no professional tax. Each band starts right after the one before; the last has no upper end. Salaries already set keep their tax until their CTC is re-applied.',
    type: 'SLAB_LIST',
    default: DEFAULT_PTAX_SLABS,
    impact: 'HIGH',
    impactNote: 'Applies to every CTC saved or re-applied from now on. Salaries already saved keep their tax until re-applied.',
  },
  integer('CTC_JUMP_WARN_PERCENT', 'PAYROLL', 'CTC jump warning', 'A new CTC this many percent above the employee\'s previous one shows a warning (a likely typo). Nothing is refused.', 50, 1, 1000, '%'),

  // ── Sales ──
  integer('MONTHLY_STOCK_DEADLINE_DAY', 'SALES', 'Monthly stock deadline day', 'Day of the next month by which a month’s opening and closing stock counts must be entered (5 = the 5th of the following month).', 5, 1, 28),

  // ── Sync ──
  integer('SYNC_MAX_BATCH', 'SYNC', 'Most records per push', 'Most records the app may send in one push. A bigger day is sent in chunks, the DCR’s own submit last.', 100, 1, 10_000),
  integer('SYNC_DRAFT_TTL_DAYS', 'SYNC', 'Backed-up record kept for', 'How long an unsent backed-up record is kept before it is purged.', 30, 1, 3650, 'days'),
  integer('SYNC_MAX_DRAFT_BYTES', 'SYNC', 'Largest backed-up record', 'Largest a single backed-up record may be, in bytes.', 65_536, 1, 10_000_000, 'bytes'),
  integer('SYNC_MAX_DRAFTS', 'SYNC', 'Most backed-up records per employee', 'Most unsent records one employee may keep backed up at once.', 2000, 1, 1_000_000),
  integer('SYNC_MAX_AGE_DAYS', 'SYNC', 'Oldest record accepted', 'How many days old a record’s creation time may be when it arrives.', 7, 1, 365, 'days'),
  integer('SYNC_CLOCK_SKEW_MINUTES', 'SYNC', 'Phone clock drift allowed', 'How far ahead of the server a record’s creation time may be (phone clocks drift).', 10, 1, 1440, 'minutes'),

  // ── Approval ──
  {
    key: 'APPROVAL_MANAGER_ONLY_KINDS',
    module: 'APPROVAL',
    label: 'Approvals that end at the manager',
    description: 'Comma-separated approval kinds that end at the manager (no Admin/HR final stage), e.g. "DAILY_PLAN". NONE = every kind goes manager, then final approver. Applies from the next submission.',
    type: 'KIND_LIST',
    default: 'NONE',
    impact: 'HIGH',
    impactNote: 'Requests of a listed kind submitted from now on are decided by the manager alone, with no Admin or HR check. Requests already in progress are not affected.',
  },

  toggle('TEAM_ALERTS_ENABLED', 'APPROVAL', 'Tell managers about their team’s requests', 'Whether a manager is sent an Inbox message for a new leave, monthly-expenses or new-doctor request from their team, for any request waiting past the approval turnaround, and when someone on their team is blocked for missed reports.', true),
  integer('APPROVAL_SLA_DAYS', 'APPROVAL', 'Approval turnaround', 'Days an approver has to act on a request. After that it is flagged overdue (nothing is approved automatically; Admin can always approve).', 3, 1, 30, 'days'),

  // ── System ──
  {
    key: 'BUSINESS_TIMEZONE',
    module: 'SYSTEM',
    label: 'Business timezone',
    description: 'IANA timezone every business deadline is read in (e.g. the Daily Plan cutoff time).',
    type: 'TIMEZONE',
    default: 'Asia/Kolkata',
    impact: 'HIGH',
    impactNote: 'Every deadline and every "today" in the system moves to the new timezone: plan cutoffs, leave dates, the missed-report check and payroll months.',
  },
  {
    key: 'DAY_START_TIME',
    module: 'SYSTEM',
    label: 'Business day starts at',
    description: 'Time of day the business day rolls over. With 02:00, work done at 01:00 on the 11th still counts as the 10th, and the last day of a month ends at 02:00 on the 1st.',
    type: 'TIME',
    default: '00:00',
    impact: 'HIGH',
    impactNote: 'From the next moment, "today", the Daily Plan day, report dates and month ends all roll over at the new time. Records already saved keep the day they were saved under. Plan deadlines are still read as a time on the plan\'s own date.',
  },
  {
    key: 'FY_CLOSED_YEARS',
    module: 'SYSTEM',
    label: 'Closed financial years',
    description: 'The financial years an Admin has closed, named by the year they start in (2025 = 2025-26), oldest first. NONE = none closed.',
    type: 'YEAR_LIST',
    default: 'NONE',
    impact: 'NORMAL',
    managedBy: 'Use the "Close year" action under Financial year, not this setting.',
  },
  {
    key: 'FY_START_MONTH',
    module: 'SYSTEM',
    label: 'Financial year starts in',
    description: 'Month the financial year — and the leave year — starts in (JANUARY … DECEMBER).',
    type: 'MONTH',
    default: 'APRIL',
    impact: 'HIGH',
    impactNote: 'Moves the boundary of the financial year and the leave year. Which year a date, a leave balance or a payroll month belongs to changes, and so do the year selectors in the portal.',
  },
  {
    key: 'WEEKLY_OFF_DAY',
    module: 'SYSTEM',
    label: 'Weekly day off',
    description: 'The weekly day off (SUNDAY … SATURDAY) — not counted inside a leave.',
    type: 'WEEKDAY',
    default: 'SUNDAY',
    impact: 'HIGH',
    impactNote: 'Leaves requested from now on skip this day instead of the old one. Leaves already counted keep the days they were counted with.',
  },
];

export const CONFIG_MODULE_LABEL: Record<string, string> = {
  PLANNING: 'Planning',
  HR: 'HR and leave',
  TERRITORY: 'Territory and routes',
  FIELD_MASTER_DATA: 'Doctors and field master data',
  AUTH: 'Devices',
  FIELD_ACTIVITY: 'Field activity and compliance',
  PAYROLL: 'Salary and payouts',
  SALES: 'Sales',
  SYNC: 'Phone sync',
  APPROVAL: 'Approvals',
  SYSTEM: 'System',
};

export function findConfigDefinition(key: string): ConfigDefinition | undefined {
  return CONFIG_DEFINITIONS.find((d) => d.key === key);
}

export type ConfigValidation = { ok: true; value: string } | { ok: false; message: string };

const fail = (message: string): ConfigValidation => ({ ok: false, message });

/**
 * Checks a value against its definition and returns it in the form the readers expect (a time as `HH:mm`, a name in capitals, a
 * timezone as `Intl` spells it). It never changes the meaning of what was typed, only its spelling.
 */
export function validateConfigValue(def: ConfigDefinition, raw: string): ConfigValidation {
  const value = raw.trim();
  switch (def.type) {
    case 'BOOLEAN': {
      const v = value.toLowerCase();
      return v === 'true' || v === 'false' ? { ok: true, value: v } : fail('Use true or false.');
    }
    case 'INTEGER': {
      const min = def.min ?? 0;
      const max = def.max ?? Number.MAX_SAFE_INTEGER;
      if (!/^\d+$/.test(value)) return fail(`Use a whole number from ${min} to ${max}.`);
      const n = Number(value);
      return n < min || n > max ? fail(`Use a whole number from ${min} to ${max}.`) : { ok: true, value: String(n) };
    }
    case 'TIME': {
      let parsed: { hour: number; minute: number };
      try {
        parsed = parseTimeOfDay(value);
      } catch {
        return fail('Use a time as HH:MM, 24-hour, e.g. 10:00.');
      }
      return { ok: true, value: `${String(parsed.hour).padStart(2, '0')}:${String(parsed.minute).padStart(2, '0')}` };
    }
    case 'MONTH': {
      const v = value.toUpperCase();
      return (MONTH_NAMES as readonly string[]).includes(v) ? { ok: true, value: v } : fail(`Use a month name: ${MONTH_NAMES[0]} to ${MONTH_NAMES[11]}.`);
    }
    case 'WEEKDAY': {
      const v = value.toUpperCase();
      return (WEEKDAY_NAMES as readonly string[]).includes(v) ? { ok: true, value: v } : fail(`Use a weekday name: ${WEEKDAY_NAMES[0]} to ${WEEKDAY_NAMES[6]}.`);
    }
    case 'TIMEZONE': {
      try {
        assertTimeZone(value);
      } catch {
        return fail('Use an IANA timezone name, e.g. Asia/Kolkata.');
      }
      // Fix only the casing, and only against Intl's own list. Its resolved name is not used: it reports legacy aliases (it calls
      // Asia/Kolkata "Asia/Calcutta"), which would quietly change a zone Admin typed correctly.
      const known = Intl.supportedValuesOf('timeZone').find((z) => z.toLowerCase() === value.toLowerCase());
      return { ok: true, value: known ?? value };
    }
    case 'YEAR_LIST': {
      if (value.toUpperCase() === 'NONE') return { ok: true, value: 'NONE' };
      const years = value.split(',').map((y) => y.trim());
      if (years.some((y) => !/^\d{4}$/.test(y))) return fail('Use NONE, or comma-separated four-digit years.');
      const sorted = [...new Set(years.map(Number))].sort((a, b) => a - b);
      return { ok: true, value: sorted.join(',') };
    }
    case 'SLAB_LIST': {
      const parsed = parseSlabs(value);
      return parsed.ok ? { ok: true, value: serialiseSlabs(parsed.slabs) } : fail(parsed.error);
    }
    case 'KIND_LIST': {
      if (value.toUpperCase() === 'NONE') return { ok: true, value: 'NONE' };
      const kinds = value.split(',').map((k) => k.trim().toUpperCase()).filter((k) => k !== '');
      if (kinds.length === 0) return fail('Use NONE, or a comma-separated list of approval kinds.');
      if (kinds.some((k) => !/^[A-Z][A-Z0-9_]*$/.test(k))) return fail('Approval kinds are capital letters, digits and underscores, e.g. DAILY_PLAN.');
      if (kinds.includes('NONE')) return fail('NONE cannot be mixed with kinds.');
      const unique = [...new Set(kinds)];
      return unique.length > 20 ? fail('At most 20 kinds.') : { ok: true, value: unique.join(',') };
    }
  }
}

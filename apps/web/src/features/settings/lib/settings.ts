import { parseSlabs, parseWeeklyOffSchedule, serialiseSlabs, serialiseWeeklyOffSchedule, type ConfigSettingDto, type ConfigType } from '@greynote/contracts';
import { summariseSlabs } from './slabRows';
import { summariseSchedule } from './weeklyOffRows';
import { istDate } from '@/lib/dates';

// ── Grouping and search ────────────────────────────────────────────────────────────────────

export interface SettingGroup {
  module: string;
  label: string;
  items: ConfigSettingDto[];
}

/** Settings grouped by module, in the order the server sent them (which keeps related settings together). */
export function groupSettings(settings: readonly ConfigSettingDto[]): SettingGroup[] {
  const groups = new Map<string, SettingGroup>();
  for (const s of settings) {
    const group = groups.get(s.module) ?? { module: s.module, label: s.moduleLabel, items: [] };
    group.items.push(s);
    groups.set(s.module, group);
  }
  return [...groups.values()];
}

/** The classes of one section: a pale header with a coloured left edge, a faint tint for the rows under it, and chips that read on the pale header. */
export interface SectionTone {
  header: string;
  body: string;
  divide: string;
  chip: string;
  chevron: string;
}

/** Full class names, so Tailwind sees them. */
const tone = (header: string, body: string, divide: string, chip: string, chevron: string): SectionTone => ({ header, body, divide, chip, chevron });

/**
 * The light tint of a module's section, header and rows alike (decision-log 2026-11-19). Fixed per module, so a section keeps its colour; Payroll is red because it moves money.
 */
const SECTION_TONES: Record<string, SectionTone> = {
  PAYROLL: tone('border-red-500 bg-red-100 text-red-950 hover:bg-red-200', 'bg-red-100/70', 'divide-red-200', 'bg-red-200 text-red-900', 'text-red-600'),
  APPROVAL: tone('border-indigo-500 bg-indigo-100 text-indigo-950 hover:bg-indigo-200', 'bg-indigo-100/70', 'divide-indigo-200', 'bg-indigo-200 text-indigo-900', 'text-indigo-600'),
  PLANNING: tone('border-blue-500 bg-blue-100 text-blue-950 hover:bg-blue-200', 'bg-blue-100/70', 'divide-blue-200', 'bg-blue-200 text-blue-900', 'text-blue-600'),
  FIELD_ACTIVITY: tone('border-teal-500 bg-teal-100 text-teal-950 hover:bg-teal-200', 'bg-teal-100/70', 'divide-teal-200', 'bg-teal-200 text-teal-900', 'text-teal-600'),
  NOTIFICATIONS: tone('border-amber-500 bg-amber-100 text-amber-950 hover:bg-amber-200', 'bg-amber-100/70', 'divide-amber-200', 'bg-amber-200 text-amber-900', 'text-amber-600'),
  SYSTEM: tone('border-slate-500 bg-slate-200 text-slate-950 hover:bg-slate-300', 'bg-slate-100/80', 'divide-slate-300', 'bg-slate-300 text-slate-900', 'text-slate-600'),
  HR: tone('border-violet-500 bg-violet-100 text-violet-950 hover:bg-violet-200', 'bg-violet-100/70', 'divide-violet-200', 'bg-violet-200 text-violet-900', 'text-violet-600'),
  TERRITORY: tone('border-emerald-500 bg-emerald-100 text-emerald-950 hover:bg-emerald-200', 'bg-emerald-100/70', 'divide-emerald-200', 'bg-emerald-200 text-emerald-900', 'text-emerald-600'),
  FIELD_MASTER_DATA: tone('border-cyan-500 bg-cyan-100 text-cyan-950 hover:bg-cyan-200', 'bg-cyan-100/70', 'divide-cyan-200', 'bg-cyan-200 text-cyan-900', 'text-cyan-600'),
  AUTH: tone('border-rose-500 bg-rose-100 text-rose-950 hover:bg-rose-200', 'bg-rose-100/70', 'divide-rose-200', 'bg-rose-200 text-rose-900', 'text-rose-600'),
  SALES: tone('border-orange-500 bg-orange-100 text-orange-950 hover:bg-orange-200', 'bg-orange-100/70', 'divide-orange-200', 'bg-orange-200 text-orange-900', 'text-orange-600'),
  SYNC: tone('border-sky-500 bg-sky-100 text-sky-950 hover:bg-sky-200', 'bg-sky-100/70', 'divide-sky-200', 'bg-sky-200 text-sky-900', 'text-sky-600'),
};
const SPARE_TONES: SectionTone[] = [
  tone('border-purple-500 bg-purple-100 text-purple-950 hover:bg-purple-200', 'bg-purple-100/70', 'divide-purple-200', 'bg-purple-200 text-purple-900', 'text-purple-600'),
  tone('border-pink-500 bg-pink-100 text-pink-950 hover:bg-pink-200', 'bg-pink-100/70', 'divide-pink-200', 'bg-pink-200 text-pink-900', 'text-pink-600'),
  tone('border-lime-500 bg-lime-100 text-lime-950 hover:bg-lime-200', 'bg-lime-100/70', 'divide-lime-200', 'bg-lime-200 text-lime-900', 'text-lime-700'),
  tone('border-fuchsia-500 bg-fuchsia-100 text-fuchsia-950 hover:bg-fuchsia-200', 'bg-fuchsia-100/70', 'divide-fuchsia-200', 'bg-fuchsia-200 text-fuchsia-900', 'text-fuchsia-600'),
];

/** A module's section tone: its own, or (for a module added later) one of a few spares picked from its name, always the same one. */
export function sectionTone(module: string): SectionTone {
  const own = SECTION_TONES[module];
  if (own) return own;
  let h = 0;
  for (const ch of module) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SPARE_TONES[h % SPARE_TONES.length]!;
}

/** Sections start open unless the person folded them (their choice is kept); a search or an invalid value never hides one. */
export const sectionOpenByDefault = (chosen: boolean | undefined, searching: boolean): boolean => (searching ? true : (chosen ?? true));

/** Matches the name, the description, the key and the group, ignoring case; an empty term matches everything. */
export function searchSettings<T extends Pick<ConfigSettingDto, 'key' | 'label' | 'description' | 'moduleLabel'>>(settings: readonly T[], term: string): T[] {
  const needle = term.trim().toLowerCase();
  if (needle === '') return [...settings];
  return settings.filter((s) => [s.label, s.description, s.key, s.moduleLabel].some((text) => text.toLowerCase().includes(needle)));
}

export const invalidSettings = (settings: readonly Pick<ConfigSettingDto, 'valid'>[]): number => settings.filter((s) => !s.valid).length;

// ── Showing a value ────────────────────────────────────────────────────────────────────────

const TITLE = (v: string) => v.charAt(0) + v.slice(1).toLowerCase();

/** A value as a person reads it: On/Off, "30 days", "January", "None". */
export function displayValue(s: Pick<ConfigSettingDto, 'type' | 'unit'>, value: string): string {
  switch (s.type) {
    case 'BOOLEAN':
      return value === 'true' ? 'On' : value === 'false' ? 'Off' : value;
    case 'INTEGER':
      return s.unit ? `${Number(value).toLocaleString('en-IN')} ${s.unit}` : Number(value).toLocaleString('en-IN');
    case 'MONTH':
    case 'WEEKDAY':
      return TITLE(value);
    case 'KIND_LIST':
      return value === 'NONE' ? 'None' : value.split(',').join(', ');
    case 'SLAB_LIST':
      return summariseSlabs(value);
    case 'WEEKLY_OFF_SCHEDULE':
      return summariseSchedule(value, istDate());
    default:
      return value;
  }
}

/** What a value may be, in a phrase: `1 to 100,000 meters`, `HH:MM, 24-hour`. */
export function rangeHint(s: Pick<ConfigSettingDto, 'type' | 'min' | 'max' | 'unit'>): string {
  switch (s.type) {
    case 'BOOLEAN':
      return 'On or off';
    case 'INTEGER': {
      const unit = s.unit ? ` ${s.unit}` : '';
      return `${(s.min ?? 0).toLocaleString('en-IN')} to ${(s.max ?? 0).toLocaleString('en-IN')}${unit}`;
    }
    case 'TIME':
      return 'HH:MM, 24-hour, e.g. 10:00';
    case 'MONTH':
      return 'A month';
    case 'WEEKDAY':
      return 'A day of the week';
    case 'TIMEZONE':
      return 'An IANA timezone, e.g. Asia/Kolkata';
    case 'KIND_LIST':
      return 'NONE, or approval kinds separated by commas, e.g. DAILY_PLAN,LEAVE';
    case 'SLAB_LIST':
      return 'Salary bands with an amount each; the first band is the lowest salary allowed';
    case 'WEEKLY_OFF_SCHEDULE':
      return 'Sets of weekly days off, each starting on a date';
  }
}

// ── Editing ────────────────────────────────────────────────────────────────────────────────

/** What a control starts with: the stored value, as the control shows it. */
export const valueToDraft = (s: Pick<ConfigSettingDto, 'value'>): string => s.value;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const KIND = /^[A-Z][A-Z0-9_]*$/;

function isTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * A quick check as the person types, mirroring the server's rules so a mistake is caught before a request. The server is the
 * authority and checks again; its message is shown if it disagrees.
 */
export function draftError(s: Pick<ConfigSettingDto, 'type' | 'min' | 'max' | 'options'>, draft: string): string | undefined {
  const value = draft.trim();
  switch (s.type) {
    case 'BOOLEAN':
      return value === 'true' || value === 'false' ? undefined : 'Choose on or off.';
    case 'INTEGER': {
      const min = s.min ?? 0;
      const max = s.max ?? Number.MAX_SAFE_INTEGER;
      const range = `Use a whole number from ${min.toLocaleString('en-IN')} to ${max.toLocaleString('en-IN')}.`;
      if (!/^\d+$/.test(value)) return range;
      const n = Number(value);
      return n < min || n > max ? range : undefined;
    }
    case 'TIME':
      return TIME.test(value) ? undefined : 'Use a time as HH:MM, 24-hour, e.g. 10:00.';
    case 'MONTH':
    case 'WEEKDAY':
      return (s.options ?? []).includes(value.toUpperCase()) ? undefined : 'Choose one from the list.';
    case 'TIMEZONE':
      return value !== '' && isTimezone(value) ? undefined : 'Use an IANA timezone name, e.g. Asia/Kolkata.';
    case 'SLAB_LIST': {
      const parsed = parseSlabs(value);
      return parsed.ok ? undefined : parsed.error;
    }
    case 'WEEKLY_OFF_SCHEDULE': {
      const parsed = parseWeeklyOffSchedule(value);
      return parsed.ok ? undefined : parsed.error;
    }
    case 'KIND_LIST': {
      if (value.toUpperCase() === 'NONE') return undefined;
      const kinds = value.split(',').map((k) => k.trim().toUpperCase()).filter((k) => k !== '');
      if (kinds.length === 0) return 'Use NONE, or a comma-separated list of approval kinds.';
      if (kinds.some((k) => !KIND.test(k))) return 'Approval kinds are capital letters, digits and underscores, e.g. DAILY_PLAN.';
      if (kinds.includes('NONE')) return 'NONE cannot be mixed with kinds.';
      return kinds.length > 20 ? 'At most 20 kinds.' : undefined;
    }
  }
}

/** The value in the form the server stores, so "is it changed?" compares like with like (` january ` is `JANUARY`, `0150` is `150`). */
export function normalizeDraft(type: ConfigType, draft: string): string {
  const value = draft.trim();
  switch (type) {
    case 'BOOLEAN':
      return value.toLowerCase();
    case 'INTEGER':
      return /^\d+$/.test(value) ? String(Number(value)) : value;
    case 'MONTH':
    case 'WEEKDAY':
      return value.toUpperCase();
    case 'SLAB_LIST': {
      const parsed = parseSlabs(value);
      return parsed.ok ? serialiseSlabs(parsed.slabs) : value;
    }
    case 'WEEKLY_OFF_SCHEDULE': {
      const parsed = parseWeeklyOffSchedule(value);
      return parsed.ok ? serialiseWeeklyOffSchedule(parsed.schedule) : value;
    }
    case 'KIND_LIST': {
      if (value.toUpperCase() === 'NONE') return 'NONE';
      return [...new Set(value.split(',').map((k) => k.trim().toUpperCase()).filter((k) => k !== ''))].join(',');
    }
    default:
      return value;
  }
}

/** True when saving would change something: a draft equal to what is stored, once normalised, has nothing to save. */
export function isChanged(s: Pick<ConfigSettingDto, 'type' | 'value'>, draft: string): boolean {
  return normalizeDraft(s.type, draft) !== s.value;
}

export const canSave = (s: Pick<ConfigSettingDto, 'type' | 'min' | 'max' | 'options' | 'value'>, draft: string): boolean =>
  draftError(s, draft) === undefined && isChanged(s, draft);

/** A draft that would put the setting back to its default. */
export const isDefaultDraft = (s: Pick<ConfigSettingDto, 'type' | 'default'>, draft: string): boolean => normalizeDraft(s.type, draft) === s.default;

// ── Confirming ─────────────────────────────────────────────────────────────────────────────

export interface ConfirmCopy {
  title: string;
  /** What moves, from the server's own note. */
  note: string | null;
  /** `April → January`. */
  change: string;
  confirm: string;
}

/** The confirmation a HIGH-impact change needs, naming the change and what it moves. `null` for an ordinary setting, which just saves. */
export function confirmCopy(s: Pick<ConfigSettingDto, 'label' | 'type' | 'unit' | 'value' | 'impact' | 'impactNote'>, draft: string): ConfirmCopy | null {
  if (s.impact !== 'HIGH') return null;
  const next = normalizeDraft(s.type, draft);
  return {
    title: `Change ${s.label.toLowerCase()}?`,
    note: s.impactNote,
    change: `${displayValue(s, s.value)} → ${displayValue(s, next)}`,
    confirm: 'Change it',
  };
}

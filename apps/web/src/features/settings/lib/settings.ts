import type { ConfigSettingDto, ConfigType } from '@greynote/contracts';

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

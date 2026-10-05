import {
  DESIGNATION_NAMES,
  PAY_BAND_NAMES,
  type CreateDesignationDto,
  type CreatePayBandDto,
  type DesignationDto,
  type DesignationName,
  type PayBandDto,
  type PayBandName,
  type UpdateDesignationDto,
  type UpdatePayBandDto,
} from '@greynote/contracts';
import { fail, type BuildResult } from '@/lib/forms';
import { paiseToRupees, rupeesToPaise } from '@/lib/money';

/**
 * Pay Band and Designation form drafts → request bodies. Forms hold strings (rupees, a level);
 * these turn them into what the API accepts, or say what is wrong per field. Pure, so the rules
 * are tested without a browser.
 */
/** The API's ceiling on one money field: ₹10 crore, in paise. */
export const MAX_PAISE = 10_000_000_000;

export const PAY_BAND_MONEY_FIELDS = [
  { key: 'taPerKmRatePaise', label: 'TA rate (per km)' },
  { key: 'hqDaPaise', label: 'DA — HQ day' },
  { key: 'exStationDaPaise', label: 'DA — Ex-station day' },
  { key: 'outStationDaPaise', label: 'DA — Out-station day' },
] as const;
export type PayBandMoneyKey = (typeof PAY_BAND_MONEY_FIELDS)[number]['key'];

/** A pay band's money fields as the rupee strings a form edits. */
export type PayBandRupees = Record<PayBandMoneyKey, string>;

export const EMPTY_PAY_BAND_RUPEES: PayBandRupees = {
  taPerKmRatePaise: '',
  hqDaPaise: '',
  exStationDaPaise: '',
  outStationDaPaise: '',
};

export function payBandToRupees(band: PayBandDto): PayBandRupees {
  return {
    taPerKmRatePaise: paiseToRupees(band.taPerKmRatePaise),
    hqDaPaise: paiseToRupees(band.hqDaPaise),
    exStationDaPaise: paiseToRupees(band.exStationDaPaise),
    outStationDaPaise: paiseToRupees(band.outStationDaPaise),
  };
}

export function moneyError(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return 'Enter an amount.';
  const paise = rupeesToPaise(trimmed);
  if (paise === null) return 'Use rupees with at most two decimals, e.g. 7.50.';
  if (paise > MAX_PAISE) return 'That is more than ₹10 crore — check for an extra zero.';
  return undefined;
}

const isPayBandName = (value: string): value is PayBandName => (PAY_BAND_NAMES as readonly string[]).includes(value);
const isDesignationName = (value: string): value is DesignationName =>
  (DESIGNATION_NAMES as readonly string[]).includes(value);

/** Names not yet taken — the API refuses a duplicate, so the form never offers one. */
export function unusedPayBandNames(existing: readonly PayBandDto[]): PayBandName[] {
  const taken = new Set(existing.map((b) => b.name));
  return PAY_BAND_NAMES.filter((n) => !taken.has(n));
}
export function unusedDesignationNames(existing: readonly DesignationDto[]): DesignationName[] {
  const taken = new Set(existing.map((d) => d.name));
  return DESIGNATION_NAMES.filter((n) => !taken.has(n));
}

/** The optional suggested yearly CTC: blank is "none" (`null`), anything else must be an amount. */
function suggestedCtcOf(raw: string, errors: Record<string, string | undefined>): number | null {
  if (raw.trim() === '') return null;
  const paise = rupeesToPaise(raw);
  if (paise === null || paise === 0) errors['suggestedCtc'] = 'Use rupees with at most two decimals, e.g. 144000 — or leave it blank.';
  else if (paise > MAX_PAISE) errors['suggestedCtc'] = 'That is more than ₹10 crore — check for an extra zero.';
  return errors['suggestedCtc'] ? null : paise;
}

export function buildPayBand(draft: { name: string; rupees: PayBandRupees; suggestedCtc?: string }): BuildResult<CreatePayBandDto> {
  const errors: Record<string, string | undefined> = { name: isPayBandName(draft.name) ? undefined : 'Choose a grade.' };
  const suggested = suggestedCtcOf(draft.suggestedCtc ?? '', errors);
  for (const { key } of PAY_BAND_MONEY_FIELDS) errors[key] = moneyError(draft.rupees[key]);
  if (Object.values(errors).some(Boolean) || !isPayBandName(draft.name)) return fail(errors);
  const paise = (key: PayBandMoneyKey) => rupeesToPaise(draft.rupees[key]) ?? 0;
  return {
    ok: true,
    body: {
      name: draft.name,
      ...(suggested === null ? {} : { suggestedCtcAnnualPaise: suggested }),
      taPerKmRatePaise: paise('taPerKmRatePaise'),
      hqDaPaise: paise('hqDaPaise'),
      exStationDaPaise: paise('exStationDaPaise'),
      outStationDaPaise: paise('outStationDaPaise'),
    },
  };
}

/**
 * An edit's validated, changed-only body. The grade name is fixed once created (it is what
 * Employees point at), so only money fields can change. `{}` means nothing changed.
 */
export function buildPayBandUpdate(original: PayBandDto, rupees: PayBandRupees, suggestedCtc?: string): BuildResult<UpdatePayBandDto> {
  const errors: Record<string, string | undefined> = {};
  const suggested = suggestedCtcOf(suggestedCtc ?? (original.suggestedCtcAnnualPaise === null ? '' : paiseToRupees(original.suggestedCtcAnnualPaise)), errors);
  for (const { key } of PAY_BAND_MONEY_FIELDS) errors[key] = moneyError(rupees[key]);
  if (Object.values(errors).some(Boolean)) return fail(errors);
  const body: UpdatePayBandDto = {};
  if (suggested !== original.suggestedCtcAnnualPaise) body.suggestedCtcAnnualPaise = suggested;
  for (const { key } of PAY_BAND_MONEY_FIELDS) {
    const paise = rupeesToPaise(rupees[key]) ?? 0;
    if (paise !== original[key]) body[key] = paise;
  }
  return { ok: true, body };
}

export const LEVEL_MAX = 99;

export function levelError(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return 'Enter a level.';
  if (!/^\d+$/.test(trimmed)) return 'Use a whole number, e.g. 1.';
  const level = Number(trimmed);
  if (level < 1 || level > LEVEL_MAX) return `Use a level from 1 to ${LEVEL_MAX}.`;
  return undefined;
}

export function buildDesignation(draft: { name: string; level: string }): BuildResult<CreateDesignationDto> {
  const errors = {
    name: isDesignationName(draft.name) ? undefined : 'Choose a designation.',
    level: levelError(draft.level),
  };
  if (errors.name || errors.level || !isDesignationName(draft.name)) return fail(errors);
  return { ok: true, body: { name: draft.name, level: Number(draft.level.trim()) } };
}

/** An edit changes only the level; the name is what the reporting rules key on. */
export function buildDesignationUpdate(original: DesignationDto, level: string): BuildResult<UpdateDesignationDto> {
  const error = levelError(level);
  if (error) return fail({ level: error });
  const next = Number(level.trim());
  return { ok: true, body: next === original.level ? {} : { level: next } };
}

export const DESIGNATION_LABEL: Record<DesignationName, string> = {
  MR: 'MR — Medical Representative',
  ASM: 'ASM — Area Sales Manager',
  RSM: 'RSM — Regional Sales Manager',
  ZSM: 'ZSM — Zonal Sales Manager',
  NSM: 'NSM — National Sales Manager',
};

import {
  DESIGNATION_NAMES,
  type CreateDesignationDto,
  type CreatePayBandDto,
  type DesignationDto,
  type DesignationName,
  type PayBandDto,
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

export const PAY_BAND_NAME_MAX = 20;

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

const isDesignationName = (value: string): value is DesignationName =>
  (DESIGNATION_NAMES as readonly string[]).includes(value);

/** Designations not yet created — the API refuses a duplicate, so the form never offers one. */
export function unusedDesignationNames(existing: readonly DesignationDto[]): DesignationName[] {
  const taken = new Set(existing.map((d) => d.name));
  return DESIGNATION_NAMES.filter((n) => !taken.has(n));
}

/** The name as the server stores it: trimmed, inner whitespace squashed. */
const gradeNameOf = (raw: string): string => raw.trim().replace(/\s+/g, ' ');

/** The grade name and the range checks both builders share. `names` are the other grades' names, for the "already exists" message. */
function payBandErrors(name: string, rupees: PayBandRupees, others: readonly string[]): Record<string, string | undefined> {
  const errors: Record<string, string | undefined> = {};
  const clean = gradeNameOf(name);
  if (clean === '') errors['name'] = 'Enter a name, e.g. G1.';
  else if (clean.length > PAY_BAND_NAME_MAX) errors['name'] = `Keep the name to ${PAY_BAND_NAME_MAX} characters.`;
  else if (others.some((o) => o.toLowerCase() === clean.toLowerCase())) errors['name'] = 'A pay grade with that name already exists.';
  for (const { key } of PAY_BAND_MONEY_FIELDS) errors[key] = moneyError(rupees[key]);
  return errors;
}

export function buildPayBand(draft: { name: string; rupees: PayBandRupees }, existing: readonly PayBandDto[] = []): BuildResult<CreatePayBandDto> {
  const errors = payBandErrors(draft.name, draft.rupees, existing.map((b) => b.name));
  if (Object.values(errors).some(Boolean)) return fail(errors);
  const paise = (key: PayBandMoneyKey) => rupeesToPaise(draft.rupees[key]) ?? 0;
  return {
    ok: true,
    body: {
      name: gradeNameOf(draft.name),
      taPerKmRatePaise: paise('taPerKmRatePaise'),
      hqDaPaise: paise('hqDaPaise'),
      exStationDaPaise: paise('exStationDaPaise'),
      outStationDaPaise: paise('outStationDaPaise'),
    },
  };
}

/** An edit's validated, changed-only body (the name too, which may be corrected). `{}` means nothing changed. */
export function buildPayBandUpdate(
  original: PayBandDto,
  draft: { name: string; rupees: PayBandRupees },
  existing: readonly PayBandDto[] = [],
): BuildResult<UpdatePayBandDto> {
  const errors = payBandErrors(draft.name, draft.rupees, existing.filter((b) => b.id !== original.id).map((b) => b.name));
  if (Object.values(errors).some(Boolean)) return fail(errors);
  const body: UpdatePayBandDto = {};
  if (gradeNameOf(draft.name) !== original.name) body.name = gradeNameOf(draft.name);
  for (const { key } of PAY_BAND_MONEY_FIELDS) {
    const paise = rupeesToPaise(draft.rupees[key]) ?? 0;
    if (paise !== original[key]) body[key] = paise;
  }
  return { ok: true, body };
}

/** The rank follows from the name (MR 1 … NSM 5, fixed on the server): the form only picks which designation to add. */
export function buildDesignation(draft: { name: string }): BuildResult<CreateDesignationDto> {
  if (!isDesignationName(draft.name)) return fail({ name: 'Choose a designation.' });
  return { ok: true, body: { name: draft.name } };
}

export const DESIGNATION_LABEL: Record<DesignationName, string> = {
  MR: 'MR — Medical Representative',
  ASM: 'ASM — Area Sales Manager',
  RSM: 'RSM — Regional Sales Manager',
  ZSM: 'ZSM — Zonal Sales Manager',
  NSM: 'NSM — National Sales Manager',
};

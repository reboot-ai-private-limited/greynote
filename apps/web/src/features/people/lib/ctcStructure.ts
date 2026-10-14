import type {
  AssignCtcDto,
  CtcStructureDto,
  PayComponentDto,
  CtcLineKind,
  PayComponentKind,
  PayComponentRuleDto,
  PreviewCtcDto,
} from '@greynote/contracts';
import { fail, squash, type BuildResult } from '@/lib/forms';
import { paiseToRupees, rupeesToPaise } from '@/lib/money';
import { basisPointsToPercent, parseCtc, percentToBasisPoints } from './ctc';
import { MAX_PAISE } from './masterData';

/**
 * One employee's own shape of the org pay components, as the form holds it (strings), and the rules around it. Pure, so the
 * rules are tested without a browser. The server checks all of it again and says why a combination does not work.
 */

export type RuleDraft =
  | { type: 'PERCENT_OF_CTC'; percent: string }
  | { type: 'PERCENT_OF_COMPONENTS'; percent: string; of: string[] }
  | { type: 'FIXED'; amount: string }
  /** A deduction: a share of the total while the salary is within the ESI ceiling. */
  | { type: 'ESI_PERCENT'; percent: string }
  /** The professional tax, from the Settings slabs: shown, never edited. */
  | { type: 'PTAX_SLAB' };

export interface ExtraDraft {
  /** Client-only, so a row keeps its identity while others are removed. */
  id: string;
  name: string;
  kind: PayComponentKind;
  rule: RuleDraft;
}

export interface StructureDraft {
  /** Basic is one of the two inputs: a share of the CTC, or a monthly amount. */
  basicMode: 'percent' | 'amount';
  /** '' = the org's own Basic %. Used while `basicMode` is `percent`. */
  basicPercent: string;
  /** Rupees a month; '' = the org's own Basic %. Used while `basicMode` is `amount`. */
  basicAmount: string;
  /** Org lines whose rule was changed for this employee. */
  rules: Record<string, RuleDraft>;
  /** Org lines not used for this employee. */
  removed: string[];
  extras: ExtraDraft[];
}

export const EMPTY_STRUCTURE_DRAFT: StructureDraft = {
  basicMode: 'percent',
  basicPercent: '',
  basicAmount: '',
  rules: {},
  removed: [],
  extras: [],
};

export const BASIC_CODE = 'BASIC';

let extraSeq = 0;
export const newExtraId = (): string => `extra-${++extraSeq}`;

// ── Rules ⇄ drafts ─────────────────────────────────────────────────────────────────────────

export function ruleToDraft(rule: PayComponentRuleDto): RuleDraft | null {
  switch (rule.type) {
    case 'PERCENT_OF_CTC':
      return { type: 'PERCENT_OF_CTC', percent: basisPointsToPercent(rule.basisPoints) };
    case 'PERCENT_OF_COMPONENTS':
      return {
        type: 'PERCENT_OF_COMPONENTS',
        percent: basisPointsToPercent(rule.basisPoints),
        of: [...rule.of],
      };
    case 'FIXED':
      return { type: 'FIXED', amount: paiseToRupees(rule.amountPaise).replace(/\.00$/, '') };
    case 'ESI_PERCENT':
      return { type: 'ESI_PERCENT', percent: basisPointsToPercent(rule.basisPoints) };
    case 'PTAX_SLAB':
      return { type: 'PTAX_SLAB' };
    case 'BALANCER':
      return null;
  }
}

/** The request form of a rule, or `null` while it is not yet a valid one (a half-typed percentage). */
export function draftToRule(draft: RuleDraft): PayComponentRuleDto | null {
  if (draft.type === 'PTAX_SLAB') return { type: 'PTAX_SLAB' };
  if (draft.type === 'FIXED') {
    const paise = rupeesToPaise(draft.amount);
    return paise === null || paise > MAX_PAISE ? null : { type: 'FIXED', amountPaise: paise };
  }
  const bp = percentToBasisPoints(draft.percent);
  if (bp === null) return null;
  if (draft.type === 'PERCENT_OF_CTC') return { type: 'PERCENT_OF_CTC', basisPoints: bp };
  if (draft.type === 'ESI_PERCENT') return { type: 'ESI_PERCENT', basisPoints: bp };
  return draft.of.length === 0
    ? null
    : { type: 'PERCENT_OF_COMPONENTS', basisPoints: bp, of: [...draft.of] };
}

/** "10% of CTC", "12% of Basic + FDA", "₹6,000 a year". */
export function describeRule(
  rule: RuleDraft | 'BALANCER',
  nameOf: (code: string) => string,
  money: (rupees: string) => string,
): string {
  if (rule === 'BALANCER') return 'The rest of the CTC';
  if (rule.type === 'PTAX_SLAB') return 'From the professional tax slabs in Settings';
  if (rule.type === 'ESI_PERCENT') return `${rule.percent}% of the total, within the ESI ceiling`;
  if (rule.type === 'FIXED') return `${money(rule.amount)} a year`;
  if (rule.type === 'PERCENT_OF_CTC') return `${rule.percent}% of CTC`;
  return `${rule.percent}% of ${rule.of.map(nameOf).join(' + ')}`;
}

// ── Stored structure → form ────────────────────────────────────────────────────────────────

/** A saved revision back into the form. Amounts typed under the old per-line override become fixed-amount rules. */
export function structureToDraft(
  structure: CtcStructureDto | undefined,
  legacyOverrides: Readonly<Record<string, number>> = {},
): StructureDraft {
  const rules: Record<string, RuleDraft> = {};
  for (const [code, paise] of Object.entries(legacyOverrides))
    rules[code] = { type: 'FIXED', amount: paiseToRupees(paise).replace(/\.00$/, '') };
  for (const [code, rule] of Object.entries(structure?.ruleOverrides ?? {})) {
    const draft = ruleToDraft(rule);
    if (draft) rules[code] = draft;
  }
  const monthly = structure?.basicMonthlyPaise;
  return {
    basicMode: monthly === undefined ? 'percent' : 'amount',
    basicAmount: monthly === undefined ? '' : paiseToRupees(monthly).replace(/\.00$/, ''),
    basicPercent:
      structure?.basicBasisPoints === undefined
        ? ''
        : basisPointsToPercent(structure.basicBasisPoints),
    rules,
    removed: [...(structure?.removed ?? [])],
    extras: (structure?.extras ?? []).flatMap((e) => {
      const rule = ruleToDraft(e.rule);
      return rule ? [{ id: newExtraId(), name: e.name, kind: e.kind, rule }] : [];
    }),
  };
}

// ── Form → request ─────────────────────────────────────────────────────────────────────────

/** An upper-case code from a name ("House rent" → HOUSE_RENT), unique among `taken`. */
export function codeFromName(name: string, taken: ReadonlySet<string>): string {
  const base =
    name
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^[0-9_]+/, '')
      .replace(/_+$/, '')
      .slice(0, 20) || 'LINE';
  let code = base.length < 2 ? `${base}X` : base;
  for (let n = 2; taken.has(code); n++) code = `${base}_${n}`.slice(0, 24);
  return code;
}

export interface StructureBuild {
  /** `undefined` when nothing differs from the org formula. */
  body: CtcStructureDto | undefined;
  /** Per field, e.g. `basicPercent`, `rule:FDA`, `extra:<id>`. Empty when everything typed is usable. */
  errors: Record<string, string>;
}

/**
 * The request for a form state. Entries that are not usable yet (a half-typed percentage) are left out of `body` and named
 * in `errors`: a preview ignores them while typing, a save refuses until `errors` is empty.
 */
export function buildStructure(draft: StructureDraft, orgCodes: readonly string[]): StructureBuild {
  const errors: Record<string, string> = {};

  // Basic is an input: a share of the CTC (up to 100%) or a monthly amount. Which fits the rest is the server's call.
  let basicBasisPoints: number | undefined;
  let basicMonthlyPaise: number | undefined;
  if (draft.basicMode === 'percent' && draft.basicPercent.trim() !== '') {
    const bp = percentToBasisPoints(draft.basicPercent);
    if (bp === null || bp < 1) errors['basicPercent'] = 'Enter a percentage from 0.01 to 100, e.g. 40 or 37.5.';
    else basicBasisPoints = bp;
  }
  if (draft.basicMode === 'amount' && draft.basicAmount.trim() !== '') {
    const paise = rupeesToPaise(draft.basicAmount);
    if (paise === null || paise < 1 || paise > MAX_PAISE) errors['basicPercent'] = 'Enter the monthly Basic in rupees, e.g. 5600.';
    else basicMonthlyPaise = paise;
  }

  const ruleOverrides: Record<string, PayComponentRuleDto> = {};
  for (const [code, rule] of Object.entries(draft.rules)) {
    if (draft.removed.includes(code)) continue;
    const built = draftToRule(rule);
    if (built) ruleOverrides[code] = built;
    else
      errors[`rule:${code}`] =
        rule.type === 'FIXED'
          ? 'Use rupees with at most two decimals.'
          : rule.type === 'PERCENT_OF_COMPONENTS' && rule.of.length === 0
            ? 'Choose what it is a percentage of.'
            : 'Use a percentage from 0 to 100, with at most two decimals.';
  }

  const taken = new Set(orgCodes);
  const extras: NonNullable<CtcStructureDto['extras']> = [];
  for (const e of draft.extras) {
    const rule = draftToRule(e.rule);
    if (e.name.trim() === '') errors[`extra:${e.id}`] = 'Give the line a name.';
    else if (!rule) errors[`extra:${e.id}`] = 'Finish the amount or percentage.';
    if (e.name.trim() === '' || !rule) continue;
    const code = codeFromName(e.name, taken);
    taken.add(code);
    extras.push({ code, name: e.name.trim().replace(/\s+/g, ' '), kind: e.kind, rule });
  }

  const empty =
    basicBasisPoints === undefined &&
    basicMonthlyPaise === undefined &&
    Object.keys(ruleOverrides).length === 0 &&
    draft.removed.length === 0 &&
    extras.length === 0;
  return {
    body: empty
      ? undefined
      : {
          ...(basicBasisPoints !== undefined && { basicBasisPoints }),
          ...(basicMonthlyPaise !== undefined && { basicMonthlyPaise }),
          ruleOverrides,
          removed: [...draft.removed],
          extras,
        },
    errors,
  };
}

// ── What the table shows ───────────────────────────────────────────────────────────────────

export interface EditorRow {
  /** The org code, or the code an added line will get. */
  code: string;
  name: string;
  kind: PayComponentKind;
  rule: RuleDraft | 'BALANCER';
  /** Set for an added line: its draft id. */
  extraId?: string;
  /** Differs from the org formula for this employee. */
  edited: boolean;
  /** Why it cannot be removed, or `null` when it can. */
  lockedReason: string | null;
}

/** The lines this employee has, in display order, with the rule each one runs on now. */
export function editorRows(org: readonly PayComponentDto[], draft: StructureDraft): EditorRow[] {
  const taken = new Set(org.map((c) => c.code));
  const base = org
    .filter((c) => c.isActive && !draft.removed.includes(c.code))
    .sort((a, b) => a.order - b.order)
    .map((c): EditorRow => {
      const isBalancer = c.rule.type === 'BALANCER';
      let rule: RuleDraft | 'BALANCER' = isBalancer
        ? 'BALANCER'
        : (ruleToDraft(c.rule) as RuleDraft);
      let edited = false;
      if (c.code === BASIC_CODE) {
        if (draft.basicMode === 'percent' && draft.basicPercent.trim() !== '') {
          rule = { type: 'PERCENT_OF_CTC', percent: draft.basicPercent };
          edited = true;
        } else if (draft.basicMode === 'amount' && draft.basicAmount.trim() !== '') {
          const rupees = Number(draft.basicAmount);
          rule = { type: 'FIXED', amount: Number.isFinite(rupees) ? String(rupees * 12) : '' };
          edited = true;
        }
      } else if (draft.rules[c.code]) {
        rule = draft.rules[c.code] as RuleDraft;
        edited = true;
      }
      return {
        code: c.code,
        name: c.name,
        kind: c.kind,
        rule,
        edited,
        lockedReason:
          c.code === BASIC_CODE
            ? 'Basic stays: it is one of the two inputs (with the CTC) that set the split.'
            : isBalancer
              ? 'This line takes whatever is left, so the total always matches the CTC.'
              : c.mandatory
                ? 'Mandatory: every employee has it, worked out from the Settings.'
                : null,
      };
    });
  const extras = draft.extras.map((e): EditorRow => {
    const code = codeFromName(e.name || 'LINE', taken);
    taken.add(code);
    return {
      code,
      name: e.name,
      kind: e.kind,
      rule: e.rule,
      extraId: e.id,
      edited: true,
      lockedReason: null,
    };
  });
  return [...base, ...extras];
}

/** Names of the lines that are worked out from `code`, so removing it would break them. */
export function dependentsOf(code: string, rows: readonly EditorRow[]): string[] {
  return rows
    .filter(
      (r) =>
        r.rule !== 'BALANCER' &&
        r.rule.type === 'PERCENT_OF_COMPONENTS' &&
        r.rule.of.includes(code),
    )
    .map((r) => r.name);
}

/** Org lines this employee does not have, to offer for adding back. */
export function removedLines(
  org: readonly PayComponentDto[],
  draft: StructureDraft,
): PayComponentDto[] {
  return org
    .filter((c) => c.isActive && draft.removed.includes(c.code))
    .sort((a, b) => a.order - b.order);
}

// ── Changing the draft (each returns a new one) ────────────────────────────────────────────

export const setRule = (d: StructureDraft, code: string, rule: RuleDraft): StructureDraft => ({
  ...d,
  rules: { ...d.rules, [code]: rule },
});
export const resetRule = (d: StructureDraft, code: string): StructureDraft => ({
  ...d,
  rules: Object.fromEntries(Object.entries(d.rules).filter(([c]) => c !== code)),
});
export const removeLine = (d: StructureDraft, code: string): StructureDraft => ({
  ...resetRule(d, code),
  removed: [...d.removed, code],
});
export const restoreLine = (d: StructureDraft, code: string): StructureDraft => ({
  ...d,
  removed: d.removed.filter((c) => c !== code),
});
export const addExtra = (d: StructureDraft, extra: Omit<ExtraDraft, 'id'>): StructureDraft => ({
  ...d,
  extras: [...d.extras, { ...extra, id: newExtraId() }],
});
export const updateExtra = (
  d: StructureDraft,
  id: string,
  patch: Partial<Omit<ExtraDraft, 'id'>>,
): StructureDraft => ({
  ...d,
  extras: d.extras.map((e) => (e.id === id ? { ...e, ...patch } : e)),
});
export const removeExtra = (d: StructureDraft, id: string): StructureDraft => ({
  ...d,
  extras: d.extras.filter((e) => e.id !== id),
});

// ── The CTC form ───────────────────────────────────────────────────────────────────────────

/** The live-preview request, or `null` until the CTC is something worth computing. Half-typed entries are ignored meanwhile. */
export function buildPreview(
  ctcInput: string,
  structure: StructureDraft,
  orgCodes: readonly string[],
): PreviewCtcDto | null {
  const ctc = parseCtc(ctcInput);
  if (ctc === null) return null;
  const { body } = buildStructure(structure, orgCodes);
  return { ctcAnnualPaise: ctc, ...(body && { structure: body }) };
}

export interface CtcDraft {
  /** Rupees a year. */
  ctc: string;
  /** `YYYY-MM`. */
  effectiveFrom: string;
  reason: string;
  structure: StructureDraft;
}

export function buildAssignCtc(
  d: CtcDraft,
  orgCodes: readonly string[],
): BuildResult<AssignCtcDto> {
  const errors: Record<string, string | undefined> = {};
  const ctc = parseCtc(d.ctc);
  if (ctc === null) errors['ctc'] = 'Enter the yearly CTC in rupees, e.g. 144000.';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(d.effectiveFrom))
    errors['effectiveFrom'] = 'Choose the month it starts.';
  if (d.reason.trim().length > 200) errors['reason'] = 'Keep the reason to 200 characters.';
  const built = buildStructure(d.structure, orgCodes);
  Object.assign(errors, built.errors);
  if (Object.values(errors).some(Boolean) || ctc === null) return fail(errors);
  const reason = squash(d.reason);
  return {
    ok: true,
    body: {
      ctcAnnualPaise: ctc,
      effectiveFrom: d.effectiveFrom,
      ...(built.body && { structure: built.body }),
      ...(reason ? { reason } : {}),
    },
  };
}

// ── Totals ─────────────────────────────────────────────────────────────────────────────────

export interface CtcTotals {
  /** What the employee is paid before any deduction: the earnings, which add up to the CTC. Annual paise. */
  paidPaise: number;
  /** EPF, ESI and professional tax. Annual paise. */
  deductionsPaise: number;
  /** What an old CTC revision put in on top (employer EPF/ESI, before 2026-10-14). Annual paise; 0 on a new one. */
  employerPaise: number;
  /** Earnings plus any employer lines: the CTC of an old revision. */
  totalPaise: number;
}

export function ctcTotals(
  lines: ReadonlyArray<{ kind: CtcLineKind; amountPaise: number }>,
): CtcTotals {
  const sum = (kind: CtcLineKind) =>
    lines.filter((l) => l.kind === kind).reduce((n, l) => n + l.amountPaise, 0);
  const paidPaise = sum('EARNING');
  const employerPaise = sum('EMPLOYER_CONTRIBUTION');
  return { paidPaise, deductionsPaise: sum('DEDUCTION'), employerPaise, totalPaise: paidPaise + employerPaise };
}

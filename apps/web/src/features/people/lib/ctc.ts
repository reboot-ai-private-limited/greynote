import type {
  CreatePayComponentDto,
  PayComponentDto,
  PayComponentKind,
  PayComponentRuleDto,
  UpdatePayComponentDto,
} from '@greynote/contracts';
import { fail, squash, type BuildResult } from '@/lib/forms';
import { rupeesToPaise } from '@/lib/money';
import { MAX_PAISE } from './masterData';

/**
 * Pay Components and CTC form drafts → request bodies. Forms hold strings (rupees, a percentage); these turn them into
 * what the API accepts, or say what is wrong per field. Pure, so the rules are tested without a browser. The server
 * re-checks the whole formula; these only stop what can be caught on the spot.
 */

/** Annual → monthly, half up (the server rounds the same way). */
export const monthlyOf = (annualPaise: number): number => Math.floor(annualPaise / 12 + 0.5);

export const KIND_LABEL: Record<PayComponentKind, string> = {
  EARNING: 'Earning',
  EMPLOYER_CONTRIBUTION: 'Employer contribution',
};

/** 3000 → "30", 75 → "0.75". */
export function basisPointsToPercent(bp: number): string {
  const whole = Math.trunc(bp / 100);
  const fraction = String(bp % 100)
    .padStart(2, '0')
    .replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : String(whole);
}

/** "0.75" → 75; `null` for anything that is not a percentage of at most two decimals, 0–100. */
export function percentToBasisPoints(input: string): number | null {
  const t = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [whole = '0', fraction = ''] = t.split('.');
  const bp = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return bp <= 10_000 ? bp : null;
}

/** How a component's rule reads in the formula table: "10% of Basic", "Fixed ₹6,000 a year", "The rest of the CTC". */
export function ruleSummary(
  rule: PayComponentRuleDto,
  byCode: ReadonlyMap<string, string>,
  money: (paise: number) => string,
): string {
  switch (rule.type) {
    case 'PERCENT_OF_CTC':
      return `${basisPointsToPercent(rule.basisPoints)}% of CTC`;
    case 'PERCENT_OF_COMPONENTS':
      return `${basisPointsToPercent(rule.basisPoints)}% of ${rule.of.map((c) => byCode.get(c) ?? c).join(' + ')}`;
    case 'FIXED':
      return `Fixed ${money(rule.amountPaise)} a year`;
    case 'BALANCER':
      return 'The rest of the CTC';
  }
}

export type RuleType = PayComponentRuleDto['type'];
export const RULE_LABEL: Record<RuleType, string> = {
  PERCENT_OF_CTC: 'Percentage of CTC',
  PERCENT_OF_COMPONENTS: 'Percentage of other components',
  FIXED: 'Fixed amount a year',
  BALANCER: 'The rest of the CTC',
};

export interface ComponentDraft {
  code: string;
  name: string;
  kind: PayComponentKind;
  ruleType: RuleType;
  /** A percentage, e.g. "0.75". */
  percent: string;
  of: string[];
  /** Rupees a year. */
  amount: string;
  order: string;
  isActive: boolean;
}

export const EMPTY_COMPONENT_DRAFT: ComponentDraft = {
  code: '',
  name: '',
  kind: 'EARNING',
  ruleType: 'PERCENT_OF_CTC',
  percent: '',
  of: [],
  amount: '',
  order: '',
  isActive: true,
};

export function componentToDraft(c: PayComponentDto): ComponentDraft {
  return {
    code: c.code,
    name: c.name,
    kind: c.kind,
    ruleType: c.rule.type,
    percent:
      c.rule.type === 'PERCENT_OF_CTC' || c.rule.type === 'PERCENT_OF_COMPONENTS'
        ? basisPointsToPercent(c.rule.basisPoints)
        : '',
    of: c.rule.type === 'PERCENT_OF_COMPONENTS' ? c.rule.of : [],
    amount: c.rule.type === 'FIXED' ? (c.rule.amountPaise / 100).toFixed(2) : '',
    order: String(c.order),
    isActive: c.isActive,
  };
}

function buildRule(
  d: ComponentDraft,
  errors: Record<string, string | undefined>,
): PayComponentRuleDto | null {
  switch (d.ruleType) {
    case 'BALANCER':
      return { type: 'BALANCER' };
    case 'FIXED': {
      const paise = rupeesToPaise(d.amount);
      if (paise === null) errors['amount'] = 'Use rupees with at most two decimals, e.g. 6000.';
      else if (paise > MAX_PAISE)
        errors['amount'] = 'That is more than ₹10 crore — check for an extra zero.';
      return paise === null || paise > MAX_PAISE ? null : { type: 'FIXED', amountPaise: paise };
    }
    default: {
      const bp = percentToBasisPoints(d.percent);
      if (bp === null)
        errors['percent'] = 'Enter a percentage from 0 to 100, with at most two decimals.';
      if (d.ruleType === 'PERCENT_OF_COMPONENTS' && d.of.length === 0)
        errors['of'] = 'Choose at least one component.';
      if (bp === null || (d.ruleType === 'PERCENT_OF_COMPONENTS' && d.of.length === 0)) return null;
      return d.ruleType === 'PERCENT_OF_CTC'
        ? { type: 'PERCENT_OF_CTC', basisPoints: bp }
        : { type: 'PERCENT_OF_COMPONENTS', basisPoints: bp, of: d.of };
    }
  }
}

function commonErrors(d: ComponentDraft): Record<string, string | undefined> {
  const errors: Record<string, string | undefined> = {};
  if (squash(d.name) === '') errors['name'] = 'Enter a name.';
  else if (squash(d.name).length > 60) errors['name'] = 'Keep the name to 60 characters.';
  if (!/^\d+$/.test(d.order.trim())) errors['order'] = 'Enter a whole number, e.g. 3.';
  return errors;
}

export function buildPayComponent(d: ComponentDraft): BuildResult<CreatePayComponentDto> {
  const errors = commonErrors(d);
  const code = d.code.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{1,23}$/.test(code))
    errors['code'] = 'Use capitals, digits and underscores, 2–24 characters, e.g. HRA.';
  const rule = buildRule(d, errors);
  if (Object.values(errors).some(Boolean) || !rule) return fail(errors);
  return {
    ok: true,
    body: {
      code,
      name: squash(d.name),
      kind: d.kind,
      rule,
      order: Number(d.order),
      isActive: d.isActive,
    },
  };
}

/** The changed fields only; `{}` means nothing changed. The code is fixed once created. */
export function buildPayComponentUpdate(
  original: PayComponentDto,
  d: ComponentDraft,
): BuildResult<UpdatePayComponentDto> {
  const errors = commonErrors(d);
  const rule = buildRule(d, errors);
  if (Object.values(errors).some(Boolean) || !rule) return fail(errors);
  const body: UpdatePayComponentDto = {};
  if (squash(d.name) !== original.name) body.name = squash(d.name);
  if (d.kind !== original.kind) body.kind = d.kind;
  if (JSON.stringify(rule) !== JSON.stringify(original.rule)) body.rule = rule;
  if (Number(d.order) !== original.order) body.order = Number(d.order);
  if (d.isActive !== original.isActive) body.isActive = d.isActive;
  return { ok: true, body };
}

/** The CTC the form currently holds, in paise — `null` while it is not a usable amount. */
export function parseCtc(input: string): number | null {
  const paise = rupeesToPaise(input);
  return paise !== null && paise > 0 && paise <= MAX_PAISE ? paise : null;
}

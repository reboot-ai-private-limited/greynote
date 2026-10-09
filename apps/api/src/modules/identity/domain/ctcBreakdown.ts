import { isPaise, proratePaise } from '@/shared/money/paise.js';
import {
  BASIC_CODE,
  BASIC_MAX_BASIS_POINTS,
  BASIC_MIN_BASIS_POINTS,
  type PayComponent,
  type PayComponentKind,
  type PayComponentRule,
} from './payComponent.entity.js';

/** A formula or an input that can't produce a breakdown. The use case turns it into a 400. */
export class CtcBreakdownError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CtcBreakdownError';
  }
}

export interface CtcLine {
  code: string;
  name: string;
  kind: PayComponentKind;
  /** Annual amount. */
  amountPaise: number;
  /** HR typed this amount for this employee instead of taking the formula's. */
  isOverridden: boolean;
}

const BASIS_POINTS = 10_000;

/** The formula itself must be coherent before any employee is computed against it. */
export function validatePayComponents(components: readonly PayComponent[]): void {
  const active = components.filter((c) => c.isActive);
  const codes = new Set<string>();
  for (const c of active) {
    if (codes.has(c.code)) throw new CtcBreakdownError(`Two components share the code ${c.code}.`);
    codes.add(c.code);
  }
  const balancers = active.filter((c) => c.rule.type === 'BALANCER');
  if (balancers.length !== 1) throw new CtcBreakdownError('Exactly one active component must be the balancer (the rest of the CTC).');

  for (const c of active) {
    const { rule } = c;
    if (rule.type === 'PERCENT_OF_CTC' || rule.type === 'PERCENT_OF_COMPONENTS') {
      if (!Number.isInteger(rule.basisPoints) || rule.basisPoints < 0 || rule.basisPoints > BASIS_POINTS) {
        throw new CtcBreakdownError(`${c.code}: the percentage must be between 0 and 100.`);
      }
    }
    if (rule.type === 'PERCENT_OF_COMPONENTS') {
      if (rule.of.length === 0) throw new CtcBreakdownError(`${c.code}: name at least one component to take a percentage of.`);
      for (const ref of rule.of) {
        const target = active.find((x) => x.code === ref);
        if (!target) throw new CtcBreakdownError(`${c.code} refers to ${ref}, which is not an active component.`);
        if (target.rule.type === 'BALANCER') throw new CtcBreakdownError(`${c.code} cannot be a percentage of the balancer.`);
      }
    }
    if (rule.type === 'FIXED' && !isPaise(rule.amountPaise)) throw new CtcBreakdownError(`${c.code}: the amount must be a whole number of paise.`);
    if (c.code === BASIC_CODE) {
      if (rule.type !== 'PERCENT_OF_CTC') throw new CtcBreakdownError('Basic must be a percentage of CTC.');
      if (rule.basisPoints < BASIC_MIN_BASIS_POINTS || rule.basisPoints > BASIC_MAX_BASIS_POINTS) {
        throw new CtcBreakdownError('Basic must be between 30% and 60% of CTC.');
      }
    }
  }
  detectCycle(active);
}

function detectCycle(active: readonly PayComponent[]): void {
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (code: string): void => {
    if (state.get(code) === 'done') return;
    if (state.get(code) === 'visiting') throw new CtcBreakdownError(`The components refer to each other in a loop at ${code}.`);
    state.set(code, 'visiting');
    const rule = active.find((c) => c.code === code)?.rule;
    if (rule?.type === 'PERCENT_OF_COMPONENTS') rule.of.forEach(visit);
    state.set(code, 'done');
  };
  active.forEach((c) => visit(c.code));
}

/**
 * Splits an annual CTC into the formula's lines. Each figure is rounded half up to whole paise once; the balancer takes
 * whatever is left, so the lines always add up to the CTC exactly. `overrides` (code → annual paise) replace a line's
 * formula amount for one employee; components that are a percentage of an overridden line follow it, and the balancer
 * re-absorbs the difference. The balancer itself cannot be overridden — it is the difference.
 */
export function computeCtcBreakdown(
  components: readonly PayComponent[],
  ctcAnnualPaise: number,
  overrides: Readonly<Record<string, number>> = {},
): CtcLine[] {
  if (!isPaise(ctcAnnualPaise) || ctcAnnualPaise === 0) throw new CtcBreakdownError('CTC must be a positive whole number of paise.');
  validatePayComponents(components);
  const active = components.filter((c) => c.isActive);
  const balancer = active.find((c) => c.rule.type === 'BALANCER')!;

  for (const [code, amount] of Object.entries(overrides)) {
    const target = active.find((c) => c.code === code);
    if (!target) throw new CtcBreakdownError(`${code} is not an active component.`);
    if (target.rule.type === 'BALANCER') throw new CtcBreakdownError(`${code} is the balancer; it is whatever the other lines leave.`);
    if (!isPaise(amount)) throw new CtcBreakdownError(`${code}: the amount must be a whole number of paise.`);
  }

  const amounts = new Map<string, number>();
  const resolve = (c: PayComponent): number => {
    const known = amounts.get(c.code);
    if (known !== undefined) return known;
    const override = overrides[c.code];
    let amount: number;
    if (override !== undefined) amount = override;
    else if (c.rule.type === 'PERCENT_OF_CTC') amount = proratePaise(ctcAnnualPaise, c.rule.basisPoints, BASIS_POINTS);
    else if (c.rule.type === 'PERCENT_OF_COMPONENTS') {
      const base = c.rule.of.reduce((sum, ref) => sum + resolve(active.find((x) => x.code === ref)!), 0);
      amount = proratePaise(base, c.rule.basisPoints, BASIS_POINTS);
    } else if (c.rule.type === 'FIXED') amount = c.rule.amountPaise;
    else throw new CtcBreakdownError('Unreachable: the balancer is resolved last.');
    amounts.set(c.code, amount);
    return amount;
  };

  let allocated = 0;
  for (const c of active) if (c !== balancer) allocated += resolve(c);
  const remainder = ctcAnnualPaise - allocated;
  if (remainder < 0) {
    throw new CtcBreakdownError(`The components add up to more than the CTC (short by ${-remainder} paise); lower an allowance or raise the CTC.`);
  }
  amounts.set(balancer.code, remainder);

  return [...active]
    .sort((a, b) => a.order - b.order)
    .map((c) => ({
      code: c.code,
      name: c.name,
      kind: c.kind,
      amountPaise: amounts.get(c.code)!,
      isOverridden: c !== balancer && overrides[c.code] !== undefined,
    }));
}

/** Annual → monthly, rounded half up once. */
export const monthlyPaise = (annualPaise: number): number => proratePaise(annualPaise, 1, 12);

/** What the employee is paid before any deduction: the CTC less the employer's own contributions. Annual paise. */
export function grossAnnualPaise(lines: readonly CtcLine[]): number {
  return lines.filter((l) => l.kind === 'EARNING').reduce((sum, l) => sum + l.amountPaise, 0);
}

// ── One employee's own shape of the formula ──────────────────────────────────────────────────────────────

/** A line that exists only for one employee (a Conveyance allowance, say). */
export type ExtraComponent = Pick<PayComponent, 'code' | 'name' | 'kind' | 'rule'>;

/**
 * How one employee's breakdown differs from the org formula (decision-log 2026-10-09): their own Basic %, a changed rule
 * for a line (FDA 14% of Basic instead of 10%), lines dropped, lines added. Only the differences are stored, so when
 * Admin changes the org formula everything the employee never touched follows it and their edits stay as set.
 */
export interface CtcStructure {
  /** This employee's Basic as a share of CTC, in basis points; the org's own when absent. */
  basicBasisPoints?: number;
  ruleOverrides: Record<string, PayComponentRule>;
  /** Org components not used for this employee. */
  removed: string[];
  extras: ExtraComponent[];
}

export const EMPTY_STRUCTURE: CtcStructure = { ruleOverrides: {}, removed: [], extras: [] };

const EXTRA_ORDER_BASE = 1000;
const CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,23}$/;

/**
 * The component list for one employee: the org's active components, less `removed`, with `ruleOverrides` and the Basic %
 * applied, plus `extras`. Basic and the balancer ("the rest") are never removed or re-ruled: Basic's share is the one
 * input that drives the split, and the balancer is what keeps the lines adding up to the CTC. The result goes through
 * `computeCtcBreakdown`, which still checks everything (one balancer, no loops, Basic 30–60%).
 */
export function applyStructure(
  org: readonly PayComponent[],
  structure: CtcStructure,
): PayComponent[] {
  const active = org.filter((c) => c.isActive);
  const byCode = new Map(active.map((c) => [c.code, c]));
  const isBalancer = (c: PayComponent | undefined): boolean => c?.rule.type === 'BALANCER';

  for (const code of structure.removed) {
    const c = byCode.get(code);
    if (!c)
      throw new CtcBreakdownError(`${code} is not an active component, so it cannot be removed.`);
    if (code === BASIC_CODE) throw new CtcBreakdownError('Basic cannot be removed.');
    if (isBalancer(c))
      throw new CtcBreakdownError(`${c.name} is the rest of the CTC and cannot be removed.`);
  }
  for (const [code, rule] of Object.entries(structure.ruleOverrides)) {
    const c = byCode.get(code);
    if (!c) throw new CtcBreakdownError(`${code} is not an active component.`);
    if (code === BASIC_CODE)
      throw new CtcBreakdownError('Set Basic through its percentage, not as a rule.');
    if (isBalancer(c))
      throw new CtcBreakdownError(`${c.name} is the rest of the CTC and cannot be given a rule.`);
    if (rule.type === 'BALANCER')
      throw new CtcBreakdownError('Only one line can be the rest of the CTC, and it already is.');
    if (structure.removed.includes(code))
      throw new CtcBreakdownError(`${code} is removed, so it cannot also be changed.`);
  }
  const extraCodes = new Set<string>();
  for (const e of structure.extras) {
    if (!CODE_PATTERN.test(e.code))
      throw new CtcBreakdownError(
        `${e.code}: use capitals, digits and underscores, e.g. CONVEYANCE.`,
      );
    if (!e.name.trim()) throw new CtcBreakdownError(`${e.code}: give the line a name.`);
    if (e.rule.type === 'BALANCER')
      throw new CtcBreakdownError('Only one line can be the rest of the CTC, and it already is.');
    if (byCode.has(e.code) || org.some((c) => c.code === e.code))
      throw new CtcBreakdownError(`${e.code} already exists in the pay components.`);
    if (extraCodes.has(e.code))
      throw new CtcBreakdownError(`Two added lines share the code ${e.code}.`);
    extraCodes.add(e.code);
  }

  const kept = active
    .filter((c) => !structure.removed.includes(c.code))
    .map((c): PayComponent => {
      if (c.code === BASIC_CODE && structure.basicBasisPoints !== undefined) {
        return { ...c, rule: { type: 'PERCENT_OF_CTC', basisPoints: structure.basicBasisPoints } };
      }
      const override = structure.ruleOverrides[c.code];
      return override ? { ...c, rule: override } : c;
    });
  const extras = structure.extras.map((e, i): PayComponent => ({
    ...e,
    id: `extra:${e.code}`,
    order: EXTRA_ORDER_BASE + i,
    isActive: true,
  }));
  const all = [...kept, ...extras];

  // A friendlier message than "refers to X, which is not an active component" when the cause is a removal.
  for (const c of all) {
    if (c.rule.type !== 'PERCENT_OF_COMPONENTS') continue;
    const gone = c.rule.of.find((ref) => structure.removed.includes(ref));
    if (gone)
      throw new CtcBreakdownError(
        `${c.code} is worked out from ${gone}, which is removed. Change ${c.code} first, or keep ${gone}.`,
      );
  }
  return all;
}

/** The breakdown for one employee: the org formula shaped by their `structure`, split of `ctcAnnualPaise`. */
export function computeStructuredBreakdown(
  org: readonly PayComponent[],
  ctcAnnualPaise: number,
  structure: CtcStructure = EMPTY_STRUCTURE,
  overrides: Readonly<Record<string, number>> = {},
): CtcLine[] {
  return computeCtcBreakdown(applyStructure(org, structure), ctcAnnualPaise, overrides);
}

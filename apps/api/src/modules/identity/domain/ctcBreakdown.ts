import { isPaise, proratePaise } from '@/shared/money/paise.js';
import {
  BASIC_CODE,
  BASIC_MAX_BASIS_POINTS,
  BASIC_MIN_BASIS_POINTS,
  type PayComponent,
  type PayComponentKind,
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

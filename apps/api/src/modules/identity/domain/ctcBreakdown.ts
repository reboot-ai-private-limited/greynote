import { slabAmountPaise, type Slab } from '@greynote/contracts';
import { isPaise, proratePaise } from '@/shared/money/paise.js';
import {
  BASIC_CODE,
  type CtcLineKind,
  type PayComponent,
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
  kind: CtcLineKind;
  /** Annual amount. */
  amountPaise: number;
  /** HR typed this amount for this employee instead of taking the formula's. */
  isOverridden: boolean;
}

/** The two settings a breakdown reads: the ESI wage ceiling and the professional tax slabs. */
export interface CtcContext {
  /** ESI is deducted only while the monthly salary is at or below this, in paise. */
  esiCeilingPaise: number;
  ptaxSlabs: readonly Slab[];
}

const BASIS_POINTS = 10_000;
const rupees = (paise: number): string => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;

/** The formula itself must be coherent before any employee is computed against it. */
export function validatePayComponents(components: readonly PayComponent[]): void {
  const active = components.filter((c) => c.isActive);
  for (const c of components) {
    if (c.mandatory && !c.isActive) throw new CtcBreakdownError(`${c.name} is mandatory and cannot be switched off.`);
    // A switched-off leftover is harmless; one in use would be worked out as something it no longer is.
    if (c.isActive && c.kind !== 'EARNING' && c.kind !== 'DEDUCTION') {
      throw new CtcBreakdownError(`${c.code} is an employer contribution, which is no longer part of the CTC. Run the pay-components migration to move EPF and ESI to deductions.`);
    }
  }
  const codes = new Set<string>();
  for (const c of active) {
    if (codes.has(c.code)) throw new CtcBreakdownError(`Two components share the code ${c.code}.`);
    codes.add(c.code);
  }
  const balancers = active.filter((c) => c.rule.type === 'BALANCER');
  if (balancers.length !== 1) throw new CtcBreakdownError('Exactly one active component must be the balancer (the rest of the CTC).');
  const ptax = active.filter((c) => c.rule.type === 'PTAX_SLAB');
  if (ptax.length !== 1) throw new CtcBreakdownError('Exactly one active component must be the professional tax.');

  for (const c of active) {
    const { rule } = c;
    if (rule.type === 'PERCENT_OF_CTC' || rule.type === 'PERCENT_OF_COMPONENTS' || rule.type === 'ESI_PERCENT') {
      if (!Number.isInteger(rule.basisPoints) || rule.basisPoints < 0 || rule.basisPoints > BASIS_POINTS) {
        throw new CtcBreakdownError(`${c.code}: the percentage must be between 0 and 100.`);
      }
    }
    if (rule.type === 'BALANCER' && c.kind !== 'EARNING') throw new CtcBreakdownError(`${c.code}: only an earning can be the rest of the CTC.`);
    if ((rule.type === 'ESI_PERCENT' || rule.type === 'PTAX_SLAB') && c.kind !== 'DEDUCTION') throw new CtcBreakdownError(`${c.code}: ESI and professional tax are deductions.`);
    if (rule.type === 'PTAX_SLAB' && !c.mandatory) throw new CtcBreakdownError(`${c.name} must be mandatory.`);
    if (rule.type === 'PERCENT_OF_COMPONENTS') {
      if (rule.of.length === 0) throw new CtcBreakdownError(`${c.code}: name at least one component to take a percentage of.`);
      for (const ref of rule.of) {
        const target = active.find((x) => x.code === ref);
        if (!target) throw new CtcBreakdownError(`${c.code} refers to ${ref}, which is not an active component.`);
        if (target.rule.type === 'BALANCER') throw new CtcBreakdownError(`${c.code} cannot be a percentage of the balancer.`);
        if (target.kind !== 'EARNING') throw new CtcBreakdownError(`${c.code} can only be a percentage of earnings, and ${ref} is a deduction.`);
      }
    }
    if (rule.type === 'FIXED' && !isPaise(rule.amountPaise)) throw new CtcBreakdownError(`${c.code}: the amount must be a whole number of paise.`);
    if (c.code === BASIC_CODE) {
      if (c.kind !== 'EARNING') throw new CtcBreakdownError('Basic must be an earning.');
      if (rule.type === 'PERCENT_OF_CTC') {
        if (rule.basisPoints < 1) throw new CtcBreakdownError('Basic must be more than zero.');
      } else if (rule.type === 'FIXED') {
        if (rule.amountPaise < 1) throw new CtcBreakdownError('Basic must be more than zero.');
      } else throw new CtcBreakdownError('Basic must be a percentage of CTC or a fixed amount.');
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
 * Splits an annual CTC into the formula's lines. The CTC is the total earnings: each earning is rounded half up to whole paise
 * once, the balancer takes whatever is left, so the earnings always add up to the CTC exactly (checked, not assumed). The
 * deductions (EPF, ESI, professional tax) are worked out beside them from the same figures and are not part of that sum.
 * `overrides` (code → annual paise) replace an earning's formula amount for one employee; components that are a percentage of an
 * overridden line follow it, and the balancer re-absorbs the difference. The balancer cannot be overridden — it is the difference —
 * and a deduction cannot be typed.
 *
 * A monthly salary below the first professional-tax slab is refused: that is the lowest salary the company assigns.
 */
export function computeCtcBreakdown(
  components: readonly PayComponent[],
  ctcAnnualPaise: number,
  overrides: Readonly<Record<string, number>> = {},
  ctx: CtcContext,
): CtcLine[] {
  if (!isPaise(ctcAnnualPaise) || ctcAnnualPaise === 0) throw new CtcBreakdownError('CTC must be a positive whole number of paise.');
  validatePayComponents(components);
  const active = components.filter((c) => c.isActive);
  const earnings = active.filter((c) => c.kind === 'EARNING');
  const deductions = active.filter((c) => c.kind === 'DEDUCTION');
  const balancer = earnings.find((c) => c.rule.type === 'BALANCER')!;

  for (const [code, amount] of Object.entries(overrides)) {
    const target = active.find((c) => c.code === code);
    if (!target) throw new CtcBreakdownError(`${code} is not an active component.`);
    if (target.rule.type === 'BALANCER') throw new CtcBreakdownError(`${code} is the balancer; it is whatever the other lines leave.`);
    if (target.kind === 'DEDUCTION') throw new CtcBreakdownError(`${code} is a deduction; it is worked out, not typed.`);
    if (!isPaise(amount)) throw new CtcBreakdownError(`${code}: the amount must be a whole number of paise.`);
  }

  const monthlySalaryPaise = monthlyPaise(ctcAnnualPaise);
  const lowest = ctx.ptaxSlabs[0]?.from ?? 0;
  if (monthlySalaryPaise < lowest * 100) {
    throw new CtcBreakdownError(`This CTC is ${rupees(monthlySalaryPaise)} a month, below ${rupees(lowest * 100)}, the lowest monthly salary that can be assigned (the first professional tax slab).`);
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
  for (const c of earnings) if (c !== balancer) allocated += resolve(c);
  const remainder = ctcAnnualPaise - allocated;
  if (remainder < 0) {
    throw new CtcBreakdownError(`The earnings add up to more than the CTC (short by ${-remainder} paise); lower Basic or an allowance, or raise the CTC.`);
  }
  amounts.set(balancer.code, remainder);
  const earned = earnings.reduce((sum, c) => sum + amounts.get(c.code)!, 0);
  if (earned !== ctcAnnualPaise) throw new CtcBreakdownError('The earnings do not add up to the CTC.');

  for (const c of deductions) {
    const { rule } = c;
    let amount: number;
    if (rule.type === 'PERCENT_OF_CTC') amount = proratePaise(ctcAnnualPaise, rule.basisPoints, BASIS_POINTS);
    else if (rule.type === 'PERCENT_OF_COMPONENTS') amount = proratePaise(rule.of.reduce((sum, ref) => sum + amounts.get(ref)!, 0), rule.basisPoints, BASIS_POINTS);
    else if (rule.type === 'FIXED') amount = rule.amountPaise;
    else if (rule.type === 'ESI_PERCENT') amount = monthlySalaryPaise <= ctx.esiCeilingPaise ? proratePaise(ctcAnnualPaise, rule.basisPoints, BASIS_POINTS) : 0;
    else if (rule.type === 'PTAX_SLAB') amount = (slabAmountPaise(ctx.ptaxSlabs, monthlySalaryPaise) ?? 0) * 12;
    else throw new CtcBreakdownError(`${c.code}: a deduction cannot be the rest of the CTC.`);
    amounts.set(c.code, amount);
  }

  return [...active]
    .sort((a, b) => a.order - b.order)
    .map((c) => ({
      code: c.code,
      name: c.name,
      kind: c.kind,
      amountPaise: amounts.get(c.code)!,
      isOverridden: c !== balancer && c.kind === 'EARNING' && overrides[c.code] !== undefined,
    }));
}

/** Annual → monthly, rounded half up once. */
export const monthlyPaise = (annualPaise: number): number => proratePaise(annualPaise, 1, 12);

/** What the employee is paid before any deduction: the earnings, which add up to the CTC. Annual paise. */
export function grossAnnualPaise(lines: readonly CtcLine[]): number {
  return lines.filter((l) => l.kind === 'EARNING').reduce((sum, l) => sum + l.amountPaise, 0);
}

/** What comes out of that pay: EPF, ESI and professional tax. Annual paise. */
export function deductionsAnnualPaise(lines: readonly CtcLine[]): number {
  return lines.filter((l) => l.kind === 'DEDUCTION').reduce((sum, l) => sum + l.amountPaise, 0);
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
  /** This employee's Basic as a share of CTC, in basis points; the org's own when absent. Not together with `basicMonthlyPaise`. */
  basicBasisPoints?: number;
  /** This employee's Basic as a monthly amount in paise, instead of a share of the CTC. */
  basicMonthlyPaise?: number;
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
 * `computeCtcBreakdown`, which still checks everything (one balancer, no loops, a professional tax line).
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
    if (c.mandatory) throw new CtcBreakdownError(`${c.name} is mandatory and cannot be removed.`);
    if (isBalancer(c))
      throw new CtcBreakdownError(`${c.name} is the rest of the CTC and cannot be removed.`);
  }
  for (const [code, rule] of Object.entries(structure.ruleOverrides)) {
    const c = byCode.get(code);
    if (!c) throw new CtcBreakdownError(`${code} is not an active component.`);
    if (code === BASIC_CODE)
      throw new CtcBreakdownError('Set Basic through its percentage or monthly amount, not as a rule.');
    if (c.mandatory) throw new CtcBreakdownError(`${c.name} is mandatory and its rule cannot be changed for one employee.`);
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

  if (structure.basicBasisPoints !== undefined && structure.basicMonthlyPaise !== undefined) {
    throw new CtcBreakdownError('Give Basic as a percentage of the CTC or as a monthly amount, not both.');
  }
  if (structure.basicMonthlyPaise !== undefined && !isPaise(structure.basicMonthlyPaise)) {
    throw new CtcBreakdownError('Basic must be a whole number of paise a month.');
  }

  const kept = active
    .filter((c) => !structure.removed.includes(c.code))
    .map((c): PayComponent => {
      if (c.code === BASIC_CODE && structure.basicBasisPoints !== undefined) {
        return { ...c, rule: { type: 'PERCENT_OF_CTC', basisPoints: structure.basicBasisPoints } };
      }
      if (c.code === BASIC_CODE && structure.basicMonthlyPaise !== undefined) {
        return { ...c, rule: { type: 'FIXED', amountPaise: structure.basicMonthlyPaise * 12 } };
      }
      const override = structure.ruleOverrides[c.code];
      return override ? { ...c, rule: override } : c;
    });
  const extras = structure.extras.map((e, i): PayComponent => ({
    ...e,
    id: `extra:${e.code}`,
    order: EXTRA_ORDER_BASE + i,
    isActive: true,
    mandatory: false,
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
  ctx: CtcContext,
): CtcLine[] {
  return computeCtcBreakdown(applyStructure(org, structure), ctcAnnualPaise, overrides, ctx);
}

/**
 * One line of the org-wide CTC formula. Percentages are whole **basis points** (1% = 100, so ESI 0.75% is `75`) so no
 * rate is ever a float; money is whole paise. See `docs/engineering/coding-standards.md`, *Money*.
 *
 * The CTC is the employee's total earnings: the `EARNING` lines add up to it exactly. `DEDUCTION` lines (EPF, ESI, professional
 * tax) are the employee's own contributions, taken out of that pay each month; they are worked out beside the CTC and are not
 * part of its sum.
 */
export type PayComponentKind = 'EARNING' | 'DEDUCTION';

/**
 * A saved line can also be `EMPLOYER_CONTRIBUTION`: CTC revisions saved before employer EPF/ESI left the CTC (decision-log
 * 2026-10-14) still carry such lines, and payroll still reads them. The formula no longer produces them.
 */
export type CtcLineKind = PayComponentKind | 'EMPLOYER_CONTRIBUTION';

export type PayComponentRule =
  /** `basisPoints` of the annual CTC (Basic, HRA…). */
  | { type: 'PERCENT_OF_CTC'; basisPoints: number }
  /** `basisPoints` of the sum of other earning components, named by `code` (FDA = 10% of Basic; EPF = 12% of Basic + FDA). */
  | { type: 'PERCENT_OF_COMPONENTS'; basisPoints: number; of: string[] }
  /** A fixed annual amount the admin sets (Medical). */
  | { type: 'FIXED'; amountPaise: number }
  /** Whatever is left of the CTC. Exactly one active earning has this rule (Special allowance). */
  | { type: 'BALANCER' }
  /** Deduction only. `basisPoints` of the total earnings, but only while the monthly salary is at or below the `ESI_WAGE_CEILING` setting; otherwise nothing. */
  | { type: 'ESI_PERCENT'; basisPoints: number }
  /** Deduction only. The professional tax for the monthly salary, from the `PTAX_SLABS` setting. */
  | { type: 'PTAX_SLAB' };

export interface PayComponent {
  id: string;
  /** Upper-case, unique — what other components and per-employee overrides refer to. */
  code: string;
  name: string;
  kind: PayComponentKind;
  rule: PayComponentRule;
  /** Display order only; evaluation follows the dependencies between components. */
  order: number;
  isActive: boolean;
  /** A line every employee must have (professional tax): it cannot be switched off, removed for one employee or given another rule. */
  mandatory: boolean;
}

/** Basic is one of the two inputs (with the CTC); every other earning is derived from it. */
export const BASIC_CODE = 'BASIC';

/**
 * One line of the org-wide CTC formula. Percentages are whole **basis points** (1% = 100, so ESI 0.75% is `75`) so no
 * rate is ever a float; money is whole paise. See `docs/engineering/coding-standards.md`, *Money*.
 */
export type PayComponentKind = 'EARNING' | 'EMPLOYER_CONTRIBUTION';

export type PayComponentRule =
  /** `basisPoints` of the annual CTC (Basic, ESI). */
  | { type: 'PERCENT_OF_CTC'; basisPoints: number }
  /** `basisPoints` of the sum of other components, named by `code` (FDA = 10% of Basic; EPF = 12% of Basic + FDA). */
  | { type: 'PERCENT_OF_COMPONENTS'; basisPoints: number; of: string[] }
  /** A fixed annual amount the admin sets (Medical). */
  | { type: 'FIXED'; amountPaise: number }
  /** Whatever is left of the CTC. Exactly one active component has this rule (Other allowance). */
  | { type: 'BALANCER' };

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
}

/** The component the 30–60% bound applies to. */
export const BASIC_CODE = 'BASIC';
export const BASIC_MIN_BASIS_POINTS = 3000;
export const BASIC_MAX_BASIS_POINTS = 6000;

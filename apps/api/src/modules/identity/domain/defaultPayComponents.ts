import type { PayComponent } from './payComponent.entity.js';

/**
 * The org's starting formula, as on the salary slip (decision-log 2026-10-14). Earnings, which add up to the CTC: Basic 40% of CTC
 * (the input), HRA 66.36% and Conveyance 42.56% of Basic, FDA 10% of Basic, Medical set by Admin, and "Special allowance" taking
 * the rest. Deductions taken from that pay: EPF 12% of Basic + FDA, ESI 0.75% of the total while the salary is at or below the ESI
 * wage ceiling, and professional tax from the slabs in System settings (mandatory). Seeded once; after that Admin owns it.
 */
export const DEFAULT_PAY_COMPONENTS: ReadonlyArray<Omit<PayComponent, 'id'>> = [
  { code: 'BASIC', name: 'Basic Salary', kind: 'EARNING', order: 1, isActive: true, mandatory: false, rule: { type: 'PERCENT_OF_CTC', basisPoints: 4000 } },
  { code: 'HRA', name: 'House Rent Allowance', kind: 'EARNING', order: 2, isActive: true, mandatory: false, rule: { type: 'PERCENT_OF_COMPONENTS', basisPoints: 6636, of: ['BASIC'] } },
  { code: 'FDA', name: 'Fixed Dearness Allowance', kind: 'EARNING', order: 3, isActive: true, mandatory: false, rule: { type: 'PERCENT_OF_COMPONENTS', basisPoints: 1000, of: ['BASIC'] } },
  { code: 'CONVEYANCE', name: 'Conveyance Allowance', kind: 'EARNING', order: 4, isActive: true, mandatory: false, rule: { type: 'PERCENT_OF_COMPONENTS', basisPoints: 4256, of: ['BASIC'] } },
  { code: 'OTHER', name: 'Special Allowance', kind: 'EARNING', order: 5, isActive: true, mandatory: false, rule: { type: 'BALANCER' } },
  { code: 'MEDICAL', name: 'Medical Allowance', kind: 'EARNING', order: 6, isActive: true, mandatory: false, rule: { type: 'FIXED', amountPaise: 0 } },
  { code: 'EPF', name: 'EPF Contribution', kind: 'DEDUCTION', order: 7, isActive: true, mandatory: false, rule: { type: 'PERCENT_OF_COMPONENTS', basisPoints: 1200, of: ['BASIC', 'FDA'] } },
  { code: 'ESI', name: 'ESI Contribution', kind: 'DEDUCTION', order: 8, isActive: true, mandatory: false, rule: { type: 'ESI_PERCENT', basisPoints: 75 } },
  { code: 'PTAX', name: 'Professional Tax', kind: 'DEDUCTION', order: 9, isActive: true, mandatory: true, rule: { type: 'PTAX_SLAB' } },
];

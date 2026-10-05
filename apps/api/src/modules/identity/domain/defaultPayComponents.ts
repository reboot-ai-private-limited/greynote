import type { PayComponent } from './payComponent.entity.js';

/**
 * The org's starting formula (Basic 30% of CTC, FDA 10% of Basic, EPF 12% of Basic + FDA, ESI 0.75% of CTC, Medical set by
 * Admin, the rest "Other allowance"). Seeded once; after that Admin owns it. HRA, Conveyance and the like are added by
 * Admin as components, not seeded as empty lines.
 */
export const DEFAULT_PAY_COMPONENTS: ReadonlyArray<Omit<PayComponent, 'id'>> = [
  { code: 'BASIC', name: 'Basic', kind: 'EARNING', order: 1, isActive: true, rule: { type: 'PERCENT_OF_CTC', basisPoints: 3000 } },
  { code: 'FDA', name: 'FDA', kind: 'EARNING', order: 2, isActive: true, rule: { type: 'PERCENT_OF_COMPONENTS', basisPoints: 1000, of: ['BASIC'] } },
  { code: 'MEDICAL', name: 'Medical allowance', kind: 'EARNING', order: 3, isActive: true, rule: { type: 'FIXED', amountPaise: 0 } },
  { code: 'OTHER', name: 'Other allowance', kind: 'EARNING', order: 4, isActive: true, rule: { type: 'BALANCER' } },
  { code: 'EPF', name: 'EPF (employer)', kind: 'EMPLOYER_CONTRIBUTION', order: 5, isActive: true, rule: { type: 'PERCENT_OF_COMPONENTS', basisPoints: 1200, of: ['BASIC', 'FDA'] } },
  { code: 'ESI', name: 'ESI (employer)', kind: 'EMPLOYER_CONTRIBUTION', order: 6, isActive: true, rule: { type: 'PERCENT_OF_CTC', basisPoints: 75 } },
];

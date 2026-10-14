import { validatePayComponents } from '../modules/identity/domain/ctcBreakdown.js';
import { DEFAULT_PAY_COMPONENTS } from '../modules/identity/domain/defaultPayComponents.js';
import type { PayComponent } from '../modules/identity/domain/payComponent.entity.js';

export interface FormulaPlan {
  /** Existing components to change. */
  updates: Array<{ id: string; code: string; patch: Partial<Omit<PayComponent, 'id' | 'code'>> }>;
  /** Components to add. */
  creates: Array<Omit<PayComponent, 'id'>>;
  /** What an operator should read before applying. */
  notes: string[];
  /** The formula as it will be, so it can be checked and used for the dry run. */
  result: PayComponent[];
  /** Why the planned formula cannot be used (it fails its own checks); empty when fine. */
  problem: string | null;
}

const byCode = (code: string) => DEFAULT_PAY_COMPONENTS.find((c) => c.code === code)!;

/**
 * Moves the org's pay components to the 2026-10-14 shape: the CTC is the total earnings, EPF and ESI are the employee's deductions (no
 * longer employer contributions inside the CTC), and professional tax is a mandatory deduction from the settings' slabs. Pure: it plans,
 * the script writes. What Admin already set (Basic %, FDA, Medical, names) is kept; only the kind and rule that must change change.
 * HRA and Conveyance, which the salary slip has, are added when the formula has none, at the slip's shares of Basic.
 */
export function planFormula(existing: readonly PayComponent[]): FormulaPlan {
  const updates: FormulaPlan['updates'] = [];
  const creates: FormulaPlan['creates'] = [];
  const notes: string[] = [];
  const result: PayComponent[] = existing.map((c) => ({ ...c, mandatory: c.mandatory ?? false }));
  const patch = (c: PayComponent, p: FormulaPlan['updates'][number]['patch']) => {
    Object.assign(c, p);
    const at = updates.find((u) => u.id === c.id);
    if (at) Object.assign(at.patch, p);
    else updates.push({ id: c.id, code: c.code, patch: { ...p } });
  };

  for (const c of result) {
    if ((c.kind as string) !== 'EMPLOYER_CONTRIBUTION') continue;
    if (c.code === 'EPF' || c.code === 'ESI') {
      patch(c, { kind: 'DEDUCTION', ...(c.name.includes('(employer)') && { name: c.code === 'EPF' ? 'EPF Contribution' : 'ESI Contribution' }) });
      if (c.code === 'ESI' && c.rule.type === 'PERCENT_OF_CTC') patch(c, { rule: { type: 'ESI_PERCENT', basisPoints: c.rule.basisPoints } });
      notes.push(`${c.code} is now an employee deduction (it was an employer contribution inside the CTC).`);
    } else if (c.isActive) {
      patch(c, { isActive: false });
      notes.push(`${c.code} was an employer contribution and is switched off: employer contributions are no longer part of the CTC. Re-add it as a deduction if it should come out of the pay.`);
    }
  }

  const nextOrder = () => Math.max(0, ...result.map((c) => c.order)) + 1;
  const add = (component: Omit<PayComponent, 'id'>) => {
    creates.push(component);
    result.push({ ...component, id: `new:${component.code}` });
  };
  for (const code of ['HRA', 'CONVEYANCE'] as const) {
    if (result.some((c) => c.code === code)) continue;
    add({ ...byCode(code), order: nextOrder() });
    notes.push(`${code} is added at the slip's share of Basic (HRA 66.36%, Conveyance 42.56%): check it under Pay components.`);
  }
  const ptax = result.find((c) => c.rule.type === 'PTAX_SLAB');
  if (!ptax) {
    add({ ...byCode('PTAX'), order: nextOrder() });
    notes.push('Professional tax is added as a mandatory deduction, from the slabs in Settings → Payroll.');
  } else if (!ptax.mandatory || !ptax.isActive) {
    patch(ptax, { mandatory: true, isActive: true });
  }

  const basic = result.find((c) => c.code === 'BASIC');
  if (basic?.rule.type === 'PERCENT_OF_CTC' && basic.rule.basisPoints !== 4000) {
    notes.push(`Basic is ${basic.rule.basisPoints / 100}% of the CTC (the slip uses 40%). It is left as set: change it under Pay components if needed.`);
  }

  let problem: string | null = null;
  try {
    validatePayComponents(result);
  } catch (error) {
    problem = error instanceof Error ? error.message : 'The formula is not valid.';
  }
  return { updates, creates, notes, result, problem };
}

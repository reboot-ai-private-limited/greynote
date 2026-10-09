import { computeStructuredBreakdown, EMPTY_STRUCTURE, grossAnnualPaise, monthlyPaise, type CtcLine, type CtcStructure } from '../../domain/ctcBreakdown.js';
import type { PayComponentRepositoryPort } from '../../domain/payComponent.repository.port.js';
import { asBadRequest } from './payComponentFormula.js';

export interface CtcPreview {
  ctcAnnualPaise: number;
  lines: CtcLine[];
  /** CTC less the employer's own contributions — what the employee is paid, before any deduction. */
  grossAnnualPaise: number;
  grossMonthlyPaise: number;
}

/** Computes a breakdown without saving anything — the live view behind the CTC form. */
export class PreviewCtcUseCase {
  constructor(private readonly components: PayComponentRepositoryPort) {}

  async execute(ctcAnnualPaise: number, overrides: Record<string, number> = {}, structure: CtcStructure = EMPTY_STRUCTURE): Promise<CtcPreview> {
    const formula = await this.components.list();
    const lines = asBadRequest(() => computeStructuredBreakdown(formula, ctcAnnualPaise, structure, overrides));
    const gross = grossAnnualPaise(lines);
    return { ctcAnnualPaise, lines, grossAnnualPaise: gross, grossMonthlyPaise: monthlyPaise(gross) };
  }
}

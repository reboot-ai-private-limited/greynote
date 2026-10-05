import { computeCtcBreakdown, grossAnnualPaise, monthlyPaise, type CtcLine } from '../../domain/ctcBreakdown.js';
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

  async execute(ctcAnnualPaise: number, overrides: Record<string, number> = {}): Promise<CtcPreview> {
    const formula = await this.components.list();
    const lines = asBadRequest(() => computeCtcBreakdown(formula, ctcAnnualPaise, overrides));
    const gross = grossAnnualPaise(lines);
    return { ctcAnnualPaise, lines, grossAnnualPaise: gross, grossMonthlyPaise: monthlyPaise(gross) };
  }
}

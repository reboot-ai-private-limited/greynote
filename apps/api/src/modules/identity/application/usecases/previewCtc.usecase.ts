import { computeStructuredBreakdown, EMPTY_STRUCTURE, grossAnnualPaise, monthlyPaise, type CtcLine, type CtcStructure } from '../../domain/ctcBreakdown.js';
import type { PayComponentRepositoryPort } from '../../domain/payComponent.repository.port.js';
import type { CtcContextPort } from './ctcContext.js';
import { asBadRequest } from './payComponentFormula.js';

export interface CtcPreview {
  ctcAnnualPaise: number;
  lines: CtcLine[];
  /** The earnings, which add up to the CTC: what the employee is paid before any deduction. */
  grossAnnualPaise: number;
  grossMonthlyPaise: number;
  /** EPF, ESI and professional tax a month at a time, and what is left of the monthly pay after them. */
  deductionsMonthlyPaise: number;
  takeHomeMonthlyPaise: number;
}

/** Computes a breakdown without saving anything — the live view behind the CTC form. */
export class PreviewCtcUseCase {
  constructor(
    private readonly components: PayComponentRepositoryPort,
    private readonly context: CtcContextPort,
  ) {}

  async execute(ctcAnnualPaise: number, overrides: Record<string, number> = {}, structure: CtcStructure = EMPTY_STRUCTURE): Promise<CtcPreview> {
    const formula = await this.components.list();
    const ctx = await this.context.read();
    const lines = asBadRequest(() => computeStructuredBreakdown(formula, ctcAnnualPaise, structure, overrides, ctx));
    const gross = grossAnnualPaise(lines);
    const grossMonthlyPaise = monthlyPaise(gross);
    const deductionsMonthlyPaise = lines.filter((l) => l.kind === 'DEDUCTION').reduce((sum, l) => sum + monthlyPaise(l.amountPaise), 0);
    return { ctcAnnualPaise, lines, grossAnnualPaise: gross, grossMonthlyPaise, deductionsMonthlyPaise, takeHomeMonthlyPaise: grossMonthlyPaise - deductionsMonthlyPaise };
  }
}

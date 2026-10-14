import { AppError } from '@/shared/errors/AppError.js';
import { validatePayComponents } from '../../domain/ctcBreakdown.js';
import type { PayComponent } from '../../domain/payComponent.entity.js';
import type { PayComponentRepositoryPort } from '../../domain/payComponent.repository.port.js';
import { asBadRequest } from './payComponentFormula.js';

export class UpdatePayComponentUseCase {
  constructor(private readonly repository: PayComponentRepositoryPort) {}

  /** Employees' saved breakdowns are frozen, so this changes only what is computed from now on. */
  async execute(id: string, patch: Partial<Omit<PayComponent, 'id' | 'code'>>): Promise<PayComponent> {
    const all = await this.repository.list();
    const current = all.find((c) => c.id === id);
    if (!current) throw AppError.notFound();
    // A mandatory line (professional tax) stays on, stays an employee deduction of its own kind and keeps its rule: only its
    // name and place in the list change.
    if (current.mandatory) {
      if (patch.isActive === false) throw AppError.badRequest(`${current.name} is mandatory and cannot be switched off.`);
      if (patch.mandatory === false) throw AppError.badRequest(`${current.name} is mandatory and cannot be made optional.`);
      if (patch.kind !== undefined && patch.kind !== current.kind) throw AppError.badRequest(`${current.name} is mandatory and its kind cannot change.`);
      if (patch.rule !== undefined && patch.rule.type !== current.rule.type) throw AppError.badRequest(`${current.name} is mandatory and its rule cannot change.`);
    }
    asBadRequest(() => validatePayComponents(all.map((c) => (c.id === id ? { ...c, ...patch } : c))));
    return this.repository.update(id, patch);
  }
}

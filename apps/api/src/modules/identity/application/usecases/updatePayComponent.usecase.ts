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
    if (!all.some((c) => c.id === id)) throw AppError.notFound();
    asBadRequest(() => validatePayComponents(all.map((c) => (c.id === id ? { ...c, ...patch } : c))));
    return this.repository.update(id, patch);
  }
}

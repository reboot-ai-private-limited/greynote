import { AppError } from '@/shared/errors/AppError.js';
import { validatePayComponents } from '../../domain/ctcBreakdown.js';
import type { PayComponent } from '../../domain/payComponent.entity.js';
import type { PayComponentRepositoryPort } from '../../domain/payComponent.repository.port.js';
import { asBadRequest } from './payComponentFormula.js';

export class CreatePayComponentUseCase {
  constructor(private readonly repository: PayComponentRepositoryPort) {}

  /** The whole formula, with this component in it, must still be coherent (one balancer, no loops, Basic 30–60%). */
  async execute(input: Omit<PayComponent, 'id'>): Promise<PayComponent> {
    const existing = await this.repository.list();
    if (existing.some((c) => c.code === input.code)) throw AppError.conflict('A component with that code already exists.', { field: 'code' });
    asBadRequest(() => validatePayComponents([...existing, { ...input, id: 'new' }]));
    return this.repository.create(input);
  }
}

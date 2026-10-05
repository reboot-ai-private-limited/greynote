import { DEFAULT_PAY_COMPONENTS } from '../../domain/defaultPayComponents.js';
import type { PayComponentRepositoryPort } from '../../domain/payComponent.repository.port.js';

/** Idempotent: writes the starting formula only when no component exists yet, so Admin's edits are never overwritten. */
export class SeedDefaultPayComponentsUseCase {
  constructor(private readonly repository: PayComponentRepositoryPort) {}

  async execute(): Promise<void> {
    if ((await this.repository.list()).length > 0) return;
    for (const component of DEFAULT_PAY_COMPONENTS) await this.repository.create(component);
  }
}

import type { PayComponent } from '../../domain/payComponent.entity.js';
import type { PayComponentRepositoryPort } from '../../domain/payComponent.repository.port.js';

export class ListPayComponentsUseCase {
  constructor(private readonly repository: PayComponentRepositoryPort) {}

  execute(): Promise<PayComponent[]> {
    return this.repository.list();
  }
}

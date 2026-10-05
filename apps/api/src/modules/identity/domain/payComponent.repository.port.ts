import type { PayComponent } from './payComponent.entity.js';

export interface PayComponentRepositoryPort {
  list(): Promise<PayComponent[]>;
  findById(id: string): Promise<PayComponent | null>;
  create(input: Omit<PayComponent, 'id'>): Promise<PayComponent>;
  update(id: string, input: Partial<Omit<PayComponent, 'id' | 'code'>>): Promise<PayComponent>;
}

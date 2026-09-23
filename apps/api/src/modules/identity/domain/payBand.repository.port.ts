import type { PayBand, PayBandName } from './payBand.entity.js';

export interface PayBandRepositoryPort {
  findById(id: string): Promise<PayBand | null>;
  findByName(name: PayBandName): Promise<PayBand | null>;
  list(): Promise<PayBand[]>;
  create(input: Omit<PayBand, 'id'>): Promise<PayBand>;
  update(id: string, input: Partial<Omit<PayBand, 'id'>>): Promise<PayBand>;
}

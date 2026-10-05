import type { PayBand } from './payBand.entity.js';

export interface PayBandRepositoryPort {
  findById(id: string): Promise<PayBand | null>;
  /** Ignoring case and extra spaces. */
  findByName(name: string): Promise<PayBand | null>;
  list(): Promise<PayBand[]>;
  create(input: Omit<PayBand, 'id'>): Promise<PayBand>;
  update(id: string, input: Partial<Omit<PayBand, 'id'>>): Promise<PayBand>;
}

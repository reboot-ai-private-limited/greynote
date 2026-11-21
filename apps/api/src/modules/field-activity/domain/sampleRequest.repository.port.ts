import type { SampleRequest, SampleRequestKind, SampleRequestStatus } from './sampleRequest.entity.js';

export interface SampleRequestRepositoryPort {
  create(input: Omit<SampleRequest, 'id'>): Promise<SampleRequest>;
  findById(id: string): Promise<SampleRequest | null>;
  list(filter: { userId?: string; status?: SampleRequestStatus; kind?: SampleRequestKind }, limit: number): Promise<SampleRequest[]>;
  /** One conditional update: only a still-`REQUESTED` one is marked done, with the credited quantities per product. `null` if it no longer is. */
  markDone(id: string, by: string, at: Date, credits: Array<{ productId: string; creditedQuantity: number }>): Promise<SampleRequest | null>;
  /** Only the owner's own, only while still `REQUESTED`. False otherwise. */
  cancel(id: string, userId: string): Promise<boolean>;
}

/** What an employee gave in their doctor calls, per product: sample quantities, and LBL (each line counts one). */
export interface GivenTotalsPort {
  givenBy(userId: string): Promise<{ samples: Array<{ productId: string; quantity: number }>; lbl: Array<{ productId: string; quantity: number }> }>;
}

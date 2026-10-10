import type { Campaign, CampaignStatus, Target, TargetKey, Visual, VisualStatus } from './marketing.entities.js';

export interface VisualRepositoryPort {
  create(input: Omit<Visual, 'id'>): Promise<Visual>;
  findById(id: string): Promise<Visual | null>;
  list(filter: { status?: VisualStatus | undefined; productId?: string | undefined }, limit: number): Promise<Visual[]>;
  setStatus(id: string, status: VisualStatus): Promise<Visual | null>;
}

export interface CampaignRepositoryPort {
  create(input: Omit<Campaign, 'id'>): Promise<Campaign>;
  findById(id: string): Promise<Campaign | null>;
  list(filter: { status?: CampaignStatus | undefined }, limit: number): Promise<Campaign[]>;
  setStatus(id: string, status: CampaignStatus): Promise<Campaign | null>;
}

export interface TargetRepositoryPort {
  /** Creates the target for this key or replaces its amount and setter — one conditional write, so two racing sets leave one row. */
  upsert(key: TargetKey, amountPaise: number, by: string, at: Date): Promise<Target>;
  findById(id: string): Promise<Target | null>;
  remove(id: string): Promise<boolean>;
  /**
   * Every target of these users whose months overlap `fromMonth`–`toMonth` (both inclusive). `scope` narrows by product and/or campaign:
   * a key left out means "any", `null` means "none" (the general target).
   */
  listOverlapping(userIds: string[], fromMonth: string, toMonth: string, scope?: { productId?: string | null; campaignId?: string | null }): Promise<Target[]>;
}

export interface VisualStoragePort {
  upload(file: Buffer, meta: { mimeType: string; folder: string }): Promise<{ url: string; publicId: string }>;
  remove(publicId: string): Promise<void>;
}

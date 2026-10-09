import type { Achievement, Campaign, CampaignStatus, Target, TargetKey, Visual, VisualStatus } from './marketing.entities.js';

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
  find(key: TargetKey): Promise<Target | null>;
  /** The sum of the targets these users have for the month, product and campaign (`null` = the general one, not "any"). */
  /** The general (no product, no campaign) target of each of these users for a month; a user with none is left out. */
  listGeneral(userIds: string[], month: string): Promise<Array<{ userId: string; targetAmountPaise: number }>>;
  sum(userIds: string[], scope: { month: string; productId: string | null; campaignId: string | null }): Promise<number>;
}

export interface AchievementRepositoryPort {
  /** Creates the month's achievement for this user or replaces its amount and setter — one conditional write. */
  upsert(userId: string, month: string, amountPaise: number, by: string, at: Date): Promise<Achievement>;
  listForUsers(userIds: string[], month: string): Promise<Achievement[]>;
}

export interface VisualStoragePort {
  upload(file: Buffer, meta: { mimeType: string; folder: string }): Promise<{ url: string; publicId: string }>;
  remove(publicId: string): Promise<void>;
}

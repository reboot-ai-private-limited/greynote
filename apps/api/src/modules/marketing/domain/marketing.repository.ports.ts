import type { Campaign, CampaignStatus, DoctorVisual, Target, TargetKey, Visual, VisualStatus } from './marketing.entities.js';

export interface VisualRepositoryPort {
  create(input: Omit<Visual, 'id'>): Promise<Visual>;
  findById(id: string): Promise<Visual | null>;
  list(filter: { status?: VisualStatus | undefined; productId?: string | undefined }, limit: number): Promise<Visual[]>;
  findByIds(ids: string[]): Promise<Visual[]>;
  setStatus(id: string, status: VisualStatus): Promise<Visual | null>;
  /** Changes what was given; a key left out stays as it was. `productId: null` makes it a general Visual. */
  update(id: string, patch: { title?: string | undefined; category?: Visual['category'] | undefined; productId?: string | null | undefined; status?: VisualStatus | undefined }): Promise<Visual | null>;
}

export interface DoctorVisualRepositoryPort {
  listActive(doctorId: string): Promise<DoctorVisual[]>;
  /** Puts these Visuals on the Doctor's list. One already on it keeps its original adder; one removed earlier comes back as added now. */
  addMany(doctorId: string, visualIds: string[], by: string, at: Date): Promise<void>;
  /** `false` if that Visual is not on the list now. */
  remove(doctorId: string, visualId: string, by: string, at: Date): Promise<boolean>;
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

import type { Paise } from '@/shared/money/paise.js';

export const VISUAL_CATEGORIES = ['E_DETAILING', 'CAMPAIGN_CREATIVE', 'BRANDING', 'OTHER'] as const;
export type VisualCategory = (typeof VISUAL_CATEGORIES)[number];
export const VISUAL_STATUSES = ['active', 'inactive'] as const;
export type VisualStatus = (typeof VISUAL_STATUSES)[number];

/** E-detailing content an Admin uploaded. `productId` is `null` for general/branding content, which still shows in the list. */
export interface Visual {
  id: string;
  productId: string | null;
  title: string;
  category: VisualCategory;
  fileUrl: string;
  /** The storage provider's id for the file — what removing it needs. */
  publicId: string;
  mimeType: string;
  uploadedBy: string;
  status: VisualStatus;
  createdAt: Date;
}

/**
 * One Visual on one Doctor's standing list: what their MR chose to show them. Add-only for the MR; a manager above the Doctor's MR or an Admin
 * removes (soft, `removedAt`), and adding it again brings the same row back. One row per (Doctor, Visual).
 */
export interface DoctorVisual {
  id: string;
  doctorId: string;
  visualId: string;
  addedBy: string;
  addedAt: Date;
  removedBy: string | null;
  removedAt: Date | null;
}

export const CAMPAIGN_STATUSES = ['active', 'inactive', 'completed'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

/** Company-wide: every active Campaign is visible to every field worker. Dates are calendar days, both inclusive. */
export interface Campaign {
  id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  status: CampaignStatus;
  createdBy: string;
  createdAt: Date;
}

/**
 * What one user is meant to sell over a run of whole months of one financial year (decision-log 2026-10-10): a month, a quarter, the year, or
 * any run between — `month` is the first and `toMonth` the last (equal for a single month). Optionally narrowed to a Product and/or a Campaign.
 * At most one per (user, range, product, campaign): setting it again replaces the amount. Ranges may overlap; each is measured on its own.
 * What was achieved is never stored here: it is the secondary the employee entered, worked out by Reports.
 */
export interface Target {
  id: string;
  userId: string;
  /** First month of the range, `YYYY-MM`. */
  month: string;
  /** Last month of the range, `YYYY-MM`; equal to `month` for a one-month target. */
  toMonth: string;
  productId: string | null;
  campaignId: string | null;
  targetAmountPaise: Paise;
  /** The same target in units, for a product target: `units × PTR = amount` when it was set in units, else the amount's units at PTR. Null for all products or a product with no PTR. */
  targetQty: number | null;
  /** Whoever set it last. */
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TargetKey {
  userId: string;
  month: string;
  toMonth: string;
  productId: string | null;
  campaignId: string | null;
}

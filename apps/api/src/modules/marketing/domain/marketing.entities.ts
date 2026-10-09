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
 * What one user is meant to sell in a month, optionally narrowed to a Product and/or a Campaign. At most one per
 * (user, month, product, campaign): setting it again replaces the amount. "Achieved" is never stored.
 */
export interface Target {
  id: string;
  userId: string;
  month: string;
  productId: string | null;
  campaignId: string | null;
  targetAmountPaise: Paise;
  /** Whoever set it last. */
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TargetKey {
  userId: string;
  month: string;
  productId: string | null;
  campaignId: string | null;
}

/**
 * What one field employee actually sold in a month, typed in by an Admin or the manager above (decision-log 2026-10-09, which replaces the
 * derived-only rule of sign-off E8 for the Sales Dashboard). One per (user, month); setting it again replaces the amount. Zero is a real figure.
 */
export interface Achievement {
  id: string;
  userId: string;
  month: string;
  achievedAmountPaise: Paise;
  /** Whoever set it last. */
  enteredBy: string;
  createdAt: Date;
  updatedAt: Date;
}

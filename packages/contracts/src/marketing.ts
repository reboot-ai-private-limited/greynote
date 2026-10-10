export const VISUAL_CATEGORIES = ['E_DETAILING', 'CAMPAIGN_CREATIVE', 'BRANDING', 'OTHER'] as const;
export type VisualCategory = (typeof VISUAL_CATEGORIES)[number];

export const VISUAL_CATEGORY_LABEL: Record<VisualCategory, string> = {
  E_DETAILING: 'E-detailing',
  CAMPAIGN_CREATIVE: 'Campaign creative',
  BRANDING: 'Branding',
  OTHER: 'Other',
};

/** E-detailing content an Admin uploaded. `productId` is `null` for general content. */
export interface VisualDto {
  id: string;
  productId: string | null;
  title: string;
  category: VisualCategory;
  fileUrl: string;
  mimeType: string;
  uploadedBy: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

/** One Visual on a Doctor's list: what the MR chose to show, and who added it when. */
export interface DoctorVisualDto {
  visual: VisualDto;
  addedBy: string;
  addedByName: string | null;
  addedAt: string;
}

/** `GET /marketing/doctors/:doctorId/visuals`. `canRemove` is true for Admin and a manager above the Doctor's MR — never for the MR. */
export interface DoctorVisualListDto {
  items: DoctorVisualDto[];
  canRemove: boolean;
}

export interface UpdateVisualDto {
  title?: string;
  category?: VisualCategory;
  /** `null` makes it a general visual. */
  productId?: string | null;
  status?: 'active' | 'inactive';
}

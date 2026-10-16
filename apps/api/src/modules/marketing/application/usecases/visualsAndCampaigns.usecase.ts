import type { Campaign, CampaignStatus, Visual, VisualCategory, VisualStatus } from '../../domain/marketing.entities.js';
import type { CampaignRepositoryPort, DoctorVisualRepositoryPort, VisualRepositoryPort, VisualStoragePort } from '../../domain/marketing.repository.ports.js';
import { MARKETING_CODES, MarketingRefusal } from '../../domain/marketingRefusal.js';
import type { ProductPort } from '../../domain/ports.js';

const LIMIT = 500;
const ALLOWED = [/^image\/(png|jpe?g|webp|gif)$/];

export interface Actor {
  id: string;
  role: string;
}

/** An Admin uploads a Visual: the file goes to storage first, then the row; if the row cannot be written the file is taken back out. */
export class CreateVisualUseCase {
  constructor(
    private readonly visuals: VisualRepositoryPort,
    private readonly products: ProductPort,
    private readonly storage: VisualStoragePort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(admin: Actor, input: { productId: string | null; title: string; category: VisualCategory; file: { buffer: Buffer; mimeType: string } }): Promise<Visual> {
    if (!ALLOWED.some((re) => re.test(input.file.mimeType))) throw new MarketingRefusal(MARKETING_CODES.unsupportedFile, 'Upload an image (PNG, JPG, WebP or GIF).');
    if (input.productId) {
      const product = await this.products.getProduct(input.productId);
      if (!product || product.status !== 'active') throw new MarketingRefusal(MARKETING_CODES.productNotFound, 'That product does not exist or is no longer active.');
    }
    const stored = await this.storage.upload(input.file.buffer, { mimeType: input.file.mimeType, folder: 'greynote/marketing/visuals' });
    try {
      return await this.visuals.create({ productId: input.productId, title: input.title, category: input.category, fileUrl: stored.url, publicId: stored.publicId, mimeType: input.file.mimeType, uploadedBy: admin.id, status: 'active', createdAt: this.now() });
    } catch (err) {
      await this.storage.remove(stored.publicId).catch(() => undefined);
      throw err;
    }
  }
}

/** Field staff see active Visuals only; Admin sees all and may filter by status. General (no-Product) Visuals are included. */
export class ListVisualsUseCase {
  constructor(private readonly visuals: VisualRepositoryPort) {}
  execute(actor: Actor, filter: { status?: VisualStatus | undefined; productId?: string | undefined }): Promise<Visual[]> {
    return this.visuals.list({ ...filter, status: actor.role === 'ADMIN' ? filter.status : 'active' }, LIMIT);
  }
}

/** Admin corrects a Visual's title, category or Product, or turns it on or off. A Visual can only be moved to an active Product, or to none (general). */
export class UpdateVisualUseCase {
  constructor(
    private readonly visuals: VisualRepositoryPort,
    private readonly products: ProductPort,
  ) {}
  async execute(id: string, patch: { title?: string | undefined; category?: VisualCategory | undefined; productId?: string | null | undefined; status?: VisualStatus | undefined }): Promise<Visual> {
    if (patch.productId) {
      const product = await this.products.getProduct(patch.productId);
      if (!product || product.status !== 'active') throw new MarketingRefusal(MARKETING_CODES.productNotFound, 'That product does not exist or is no longer active.');
    }
    const visual = await this.visuals.update(id, patch);
    if (!visual) throw new MarketingRefusal(MARKETING_CODES.visualNotFound, 'No such visual.');
    return visual;
  }
}

/**
 * Admin puts a new file on an existing Visual: the new one goes to storage first, the Visual is pointed at it, and only then is the old file taken
 * out of Cloudinary. If the Visual cannot be updated the new file is taken back out; if the old one cannot be removed the Visual still works (the
 * leftover is logged by the caller's storage adapter and costs only space). Everyone who has the Visual on a doctor's list sees the new file.
 */
export class ReplaceVisualFileUseCase {
  constructor(
    private readonly visuals: VisualRepositoryPort,
    private readonly storage: VisualStoragePort,
  ) {}

  async execute(id: string, file: { buffer: Buffer; mimeType: string }): Promise<Visual> {
    if (!ALLOWED.some((re) => re.test(file.mimeType))) throw new MarketingRefusal(MARKETING_CODES.unsupportedFile, 'Upload an image (PNG, JPG, WebP or GIF).');
    if (!(await this.visuals.findById(id))) throw new MarketingRefusal(MARKETING_CODES.visualNotFound, 'No such visual.');
    const stored = await this.storage.upload(file.buffer, { mimeType: file.mimeType, folder: 'greynote/marketing/visuals' });
    let before: Visual | null;
    try {
      before = await this.visuals.replaceFile(id, { fileUrl: stored.url, publicId: stored.publicId, mimeType: file.mimeType });
    } catch (err) {
      await this.storage.remove(stored.publicId).catch(() => undefined);
      throw err;
    }
    if (!before) {
      await this.storage.remove(stored.publicId).catch(() => undefined);
      throw new MarketingRefusal(MARKETING_CODES.visualNotFound, 'No such visual.');
    }
    await this.storage.remove(before.publicId).catch(() => undefined);
    const after = await this.visuals.findById(id);
    return after as Visual;
  }
}

/** What deleting a Visual would take away: how many doctors have it on their list. A warning only. */
export class GetVisualDeleteImpactUseCase {
  constructor(
    private readonly visuals: VisualRepositoryPort,
    private readonly doctorVisuals: DoctorVisualRepositoryPort,
  ) {}

  async execute(id: string): Promise<{ id: string; title: string; doctors: number }> {
    const visual = await this.visuals.findById(id);
    if (!visual) throw new MarketingRefusal(MARKETING_CODES.visualNotFound, 'No such visual.');
    return { id, title: visual.title, doctors: await this.doctorVisuals.countDoctorsWith(id) };
  }
}

/** Admin deletes a Visual for good: the row, every doctor's pick of it, and its file in Cloudinary (a file that cannot be removed does not undo the delete). */
export class DeleteVisualUseCase {
  constructor(
    private readonly visuals: VisualRepositoryPort,
    private readonly doctorVisuals: DoctorVisualRepositoryPort,
    private readonly storage: VisualStoragePort,
  ) {}

  async execute(id: string): Promise<void> {
    const visual = await this.visuals.delete(id);
    if (!visual) throw new MarketingRefusal(MARKETING_CODES.visualNotFound, 'No such visual.');
    await this.doctorVisuals.deleteAllFor(id);
    await this.storage.remove(visual.publicId).catch(() => undefined);
  }
}

export class CreateCampaignUseCase {
  constructor(
    private readonly campaigns: CampaignRepositoryPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(admin: Actor, input: { name: string; description: string; startDate: string; endDate: string }): Promise<Campaign> {
    if (input.endDate < input.startDate) throw new MarketingRefusal(MARKETING_CODES.invalidDates, 'A campaign cannot end before it starts.');
    return this.campaigns.create({ ...input, status: 'active', createdBy: admin.id, createdAt: this.now() });
  }
}

/** Field staff see active Campaigns only (company-wide, no scoping); Admin sees all and may filter by status. */
export class ListCampaignsUseCase {
  constructor(private readonly campaigns: CampaignRepositoryPort) {}
  execute(actor: Actor, filter: { status?: CampaignStatus | undefined }): Promise<Campaign[]> {
    return this.campaigns.list({ status: actor.role === 'ADMIN' ? filter.status : 'active' }, LIMIT);
  }
}

export class SetCampaignStatusUseCase {
  constructor(private readonly campaigns: CampaignRepositoryPort) {}
  async execute(id: string, status: CampaignStatus): Promise<Campaign> {
    const campaign = await this.campaigns.setStatus(id, status);
    if (!campaign) throw new MarketingRefusal(MARKETING_CODES.campaignNotFound, 'No such campaign.');
    return campaign;
  }
}


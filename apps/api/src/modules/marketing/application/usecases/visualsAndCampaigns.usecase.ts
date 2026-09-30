import type { Campaign, CampaignStatus, Visual, VisualCategory, VisualStatus } from '../../domain/marketing.entities.js';
import type { CampaignRepositoryPort, VisualRepositoryPort, VisualStoragePort } from '../../domain/marketing.repository.ports.js';
import { MARKETING_CODES, MarketingRefusal } from '../../domain/marketingRefusal.js';
import type { ProductPort } from '../../domain/ports.js';

const LIMIT = 500;
const ALLOWED = [/^image\/(png|jpe?g|webp|gif)$/, /^application\/pdf$/, /^video\/(mp4|quicktime|webm)$/];

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
    if (!ALLOWED.some((re) => re.test(input.file.mimeType))) throw new MarketingRefusal(MARKETING_CODES.unsupportedFile, 'Upload an image, a PDF or an MP4/MOV/WebM video.');
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

export class SetVisualStatusUseCase {
  constructor(private readonly visuals: VisualRepositoryPort) {}
  async execute(id: string, status: VisualStatus): Promise<Visual> {
    const visual = await this.visuals.setStatus(id, status);
    if (!visual) throw new MarketingRefusal(MARKETING_CODES.visualNotFound, 'No such visual.');
    return visual;
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


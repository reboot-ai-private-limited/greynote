import type { Router } from 'express';
import type { ConfigReader } from '@/shared/config/readConfig.js';
import { GetTargetSummaryUseCase, ListMonthFiguresUseCase, SetAchievementUseCase, SetTargetUseCase } from './application/usecases/targets.usecase.js';
import { CreateCampaignUseCase, CreateVisualUseCase, ListCampaignsUseCase, ListVisualsUseCase, SetCampaignStatusUseCase, SetVisualStatusUseCase } from './application/usecases/visualsAndCampaigns.usecase.js';
import type { ProductPort, SalesPort, UserDirectoryPort } from './domain/ports.js';
import { CloudinaryVisualStorage } from './infrastructure/cloudinaryVisualStorage.adapter.js';
import { MongoAchievementAdapter, MongoCampaignAdapter, MongoTargetAdapter, MongoVisualAdapter } from './infrastructure/mongoMarketing.adapter.js';
import { makeMarketingControllers } from './interface/marketing.controller.js';
import { buildMarketingRouter } from './interface/marketing.route.js';
import type { MarketingPublicContract } from './marketing.public.js';

export interface MarketingContainer {
  contract: MarketingPublicContract;
  buildRouter: () => Router;
}

/**
 * Tier 5. Visuals, Campaigns and Targets (LLD marketing.md). No approval anywhere. Identity's, Field Master Data's and
 * Sales' public contracts, passed in by the composition root; files go to Cloudinary, configured only when one is uploaded.
 */
export function buildMarketingContainer(users: UserDirectoryPort, master: ProductPort, sales: SalesPort, config: ConfigReader): MarketingContainer {
  const visuals = new MongoVisualAdapter();
  const campaigns = new MongoCampaignAdapter();
  const targets = new MongoTargetAdapter();
  const achievements = new MongoAchievementAdapter();

  const getTarget = new GetTargetSummaryUseCase(targets, campaigns, users, sales);
  const listMonthFigures = new ListMonthFiguresUseCase(targets, achievements);
  return {
    contract: {
      getTargetSummary: (userId, scope) => getTarget.execute({ id: 'system', role: 'ADMIN' }, userId, { month: scope.month, productId: scope.productId ?? null, campaignId: scope.campaignId ?? null }),
      listMonthFigures: (userIds, month) => listMonthFigures.execute(userIds, month),
    },
    buildRouter: () =>
      buildMarketingRouter(
        makeMarketingControllers({
          createVisual: new CreateVisualUseCase(visuals, master, new CloudinaryVisualStorage()),
          listVisuals: new ListVisualsUseCase(visuals),
          setVisualStatus: new SetVisualStatusUseCase(visuals),
          createCampaign: new CreateCampaignUseCase(campaigns),
          listCampaigns: new ListCampaignsUseCase(campaigns),
          setCampaignStatus: new SetCampaignStatusUseCase(campaigns),
          setTarget: new SetTargetUseCase(targets, campaigns, master, users, config),
          setAchievement: new SetAchievementUseCase(achievements, users, config),
          getTarget,
        }),
      ),
  };
}

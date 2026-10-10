import type { Router } from 'express';
import type { ConfigReader } from '@/shared/config/readConfig.js';
import { DeleteTargetUseCase, GetTargetSummaryUseCase, ListTargetSharesUseCase, ListTargetsUseCase, SetTargetUseCase } from './application/usecases/targets.usecase.js';
import { AddDoctorVisualsUseCase, ListDoctorVisualsUseCase, RemoveDoctorVisualUseCase } from './application/usecases/doctorVisuals.usecase.js';
import { CreateCampaignUseCase, CreateVisualUseCase, ListCampaignsUseCase, ListVisualsUseCase, SetCampaignStatusUseCase, UpdateVisualUseCase } from './application/usecases/visualsAndCampaigns.usecase.js';
import type { DoctorPort, ProductPort, SalesPort, UserDirectoryPort } from './domain/ports.js';
import { CloudinaryVisualStorage } from './infrastructure/cloudinaryVisualStorage.adapter.js';
import { MongoCampaignAdapter, MongoDoctorVisualAdapter, MongoTargetAdapter, MongoVisualAdapter } from './infrastructure/mongoMarketing.adapter.js';
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
export function buildMarketingContainer(users: UserDirectoryPort, master: ProductPort & DoctorPort, sales: SalesPort, config: ConfigReader): MarketingContainer {
  const visuals = new MongoVisualAdapter();
  const doctorVisuals = new MongoDoctorVisualAdapter();
  const campaigns = new MongoCampaignAdapter();
  const targets = new MongoTargetAdapter();

  const getTarget = new GetTargetSummaryUseCase(targets, campaigns, users, sales);
  const listTargetShares = new ListTargetSharesUseCase(targets);
  return {
    contract: {
      getTargetSummary: (userId, scope) => getTarget.execute({ id: 'system', role: 'ADMIN' }, userId, { month: scope.month, productId: scope.productId ?? null, campaignId: scope.campaignId ?? null }),
      listTargetShares: (userIds, fromMonth, toMonth) => listTargetShares.execute(userIds, fromMonth, toMonth),
    },
    buildRouter: () =>
      buildMarketingRouter(
        makeMarketingControllers({
          createVisual: new CreateVisualUseCase(visuals, master, new CloudinaryVisualStorage()),
          listVisuals: new ListVisualsUseCase(visuals),
          updateVisual: new UpdateVisualUseCase(visuals, master),
          listDoctorVisuals: new ListDoctorVisualsUseCase(doctorVisuals, visuals, master, users),
          addDoctorVisuals: new AddDoctorVisualsUseCase(doctorVisuals, visuals, master, users),
          removeDoctorVisual: new RemoveDoctorVisualUseCase(doctorVisuals, master, users),
          createCampaign: new CreateCampaignUseCase(campaigns),
          listCampaigns: new ListCampaignsUseCase(campaigns),
          setCampaignStatus: new SetCampaignStatusUseCase(campaigns),
          setTarget: new SetTargetUseCase(targets, campaigns, master, users, config),
          deleteTarget: new DeleteTargetUseCase(targets, users, config),
          listTargets: new ListTargetsUseCase(targets, users),
          getTarget,
        }),
      ),
  };
}

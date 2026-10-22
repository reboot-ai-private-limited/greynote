import type { Router } from 'express';
import { Types } from 'mongoose';
import { DoctorVisualModel } from './infrastructure/marketing.schema.js';
import { LeaverTargets } from './application/leaverTargets.js';
import type { ConfigReader } from '@/shared/config/readConfig.js';
import { DeleteTargetUseCase, GetTargetSummaryUseCase, ListTargetSharesUseCase, ListTargetsUseCase, SetTargetUseCase, UpdateTargetUseCase } from './application/usecases/targets.usecase.js';
import { AddDoctorVisualsUseCase, ListDoctorVisualsUseCase, RemoveDoctorVisualUseCase } from './application/usecases/doctorVisuals.usecase.js';
import { CreateCampaignUseCase, CreateVisualUseCase, DeleteVisualUseCase, GetVisualDeleteImpactUseCase, ListCampaignsUseCase, ListVisualsUseCase, ReplaceVisualFileUseCase, SetCampaignStatusUseCase, UpdateVisualUseCase } from './application/usecases/visualsAndCampaigns.usecase.js';
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
  const leaverTargets = new LeaverTargets(targets);

  const getTarget = new GetTargetSummaryUseCase(targets, campaigns, users, sales);
  const listTargetShares = new ListTargetSharesUseCase(targets);
  return {
    contract: {
      getTargetSummary: (userId, scope) => getTarget.execute({ id: 'system', role: 'ADMIN' }, userId, { month: scope.month, productId: scope.productId ?? null, campaignId: scope.campaignId ?? null }),
      listTargetShares: (userIds, fromMonth, toMonth) => listTargetShares.execute(userIds, fromMonth, toMonth),
      countLeaverTargets: (userId, lastWorkingDay) => leaverTargets.count(userId, lastWorkingDay),
      cutLeaverTargets: (userId, lastWorkingDay, actorId) => leaverTargets.cut(userId, lastWorkingDay, actorId),
      countDoctorVisuals: async (doctorId) => (Types.ObjectId.isValid(doctorId) ? DoctorVisualModel.countDocuments({ doctorId: new Types.ObjectId(doctorId), removedAt: null }) : 0),
    },
    buildRouter: () =>
      buildMarketingRouter(
        makeMarketingControllers({
          createVisual: new CreateVisualUseCase(visuals, master, new CloudinaryVisualStorage()),
          replaceVisualFile: new ReplaceVisualFileUseCase(visuals, new CloudinaryVisualStorage()),
          getVisualDeleteImpact: new GetVisualDeleteImpactUseCase(visuals, doctorVisuals),
          deleteVisual: new DeleteVisualUseCase(visuals, doctorVisuals, new CloudinaryVisualStorage()),
          listVisuals: new ListVisualsUseCase(visuals),
          updateVisual: new UpdateVisualUseCase(visuals, master),
          listDoctorVisuals: new ListDoctorVisualsUseCase(doctorVisuals, visuals, master, users),
          addDoctorVisuals: new AddDoctorVisualsUseCase(doctorVisuals, visuals, master, users),
          removeDoctorVisual: new RemoveDoctorVisualUseCase(doctorVisuals, master, users),
          createCampaign: new CreateCampaignUseCase(campaigns),
          listCampaigns: new ListCampaignsUseCase(campaigns),
          setCampaignStatus: new SetCampaignStatusUseCase(campaigns),
          setTarget: new SetTargetUseCase(targets, campaigns, master, users, config),
          updateTarget: new UpdateTargetUseCase(targets, campaigns, master, users, config),
          deleteTarget: new DeleteTargetUseCase(targets, users, config),
          listTargets: new ListTargetsUseCase(targets, users),
          getTarget,
        }),
      ),
  };
}

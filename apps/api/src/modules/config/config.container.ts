import type { Router } from 'express';
import { GetConfigValueUseCase } from './application/usecases/getConfigValue.usecase.js';
import { GetPublicConfigUseCase } from './application/usecases/getPublicConfig.usecase.js';
import { ListConfigUseCase } from './application/usecases/listConfig.usecase.js';
import { SeedDefaultConfigUseCase } from './application/usecases/seedDefaultConfig.usecase.js';
import { UpdateConfigValueUseCase } from './application/usecases/updateConfigValue.usecase.js';
import { MongoSystemConfigAdapter } from './infrastructure/mongoSystemConfig.adapter.js';
import { makeListConfigController, makePublicConfigController, makeUpdateConfigController } from './interface/config.controller.js';
import { buildConfigRouter } from './interface/config.route.js';
import type { ConfigPublicContract } from './config.public.js';

export interface ConfigContainer {
  contract: ConfigPublicContract;
  /** Idempotent — upserts default keys that don't already exist. Call once at boot. */
  seed: () => Promise<void>;
  buildRouter: () => Router;
}

export function buildConfigContainer(): ConfigContainer {
  const repository = new MongoSystemConfigAdapter();
  const getConfigValue = new GetConfigValueUseCase(repository);
  const seedDefaultConfig = new SeedDefaultConfigUseCase(repository);
  const updateConfigValue = new UpdateConfigValueUseCase(repository);
  const listConfig = new ListConfigUseCase(repository);
  const getPublicConfig = new GetPublicConfigUseCase(repository);

  return {
    contract: {
      get: (key: string) => getConfigValue.execute(key),
    },
    seed: () => seedDefaultConfig.execute(),
    buildRouter: () => buildConfigRouter({ list: makeListConfigController(listConfig), publicSettings: makePublicConfigController(getPublicConfig), update: makeUpdateConfigController(updateConfigValue) }),
  };
}

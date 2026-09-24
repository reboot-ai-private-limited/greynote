import type { Router } from 'express';
import { GetConfigValueUseCase } from './application/usecases/getConfigValue.usecase.js';
import { SeedDefaultConfigUseCase } from './application/usecases/seedDefaultConfig.usecase.js';
import { UpdateConfigValueUseCase } from './application/usecases/updateConfigValue.usecase.js';
import { MongoSystemConfigAdapter } from './infrastructure/mongoSystemConfig.adapter.js';
import { makeUpdateConfigController } from './interface/config.controller.js';
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

  return {
    contract: {
      get: (key: string) => getConfigValue.execute(key),
    },
    seed: () => seedDefaultConfig.execute(),
    buildRouter: () => buildConfigRouter({ update: makeUpdateConfigController(updateConfigValue) }),
  };
}

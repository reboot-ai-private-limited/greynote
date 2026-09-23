import { GetConfigValueUseCase } from './application/usecases/getConfigValue.usecase.js';
import { SeedDefaultConfigUseCase } from './application/usecases/seedDefaultConfig.usecase.js';
import { MongoSystemConfigAdapter } from './infrastructure/mongoSystemConfig.adapter.js';
import type { ConfigPublicContract } from './config.public.js';

export interface ConfigContainer {
  contract: ConfigPublicContract;
  /** Idempotent — upserts default keys that don't already exist. Call once at boot. */
  seed: () => Promise<void>;
}

/**
 * No `interface/` layer and no `buildRouter` here, unlike `health` — there is genuinely no HTTP
 * surface for Config yet (Admin config screens are Phase 9/web-portal). Adding one later is a
 * pure addition to this file, not a different shape.
 */
export function buildConfigContainer(): ConfigContainer {
  const repository = new MongoSystemConfigAdapter();
  const getConfigValue = new GetConfigValueUseCase(repository);
  const seedDefaultConfig = new SeedDefaultConfigUseCase(repository);

  return {
    contract: {
      get: (key: string) => getConfigValue.execute(key),
    },
    seed: () => seedDefaultConfig.execute(),
  };
}

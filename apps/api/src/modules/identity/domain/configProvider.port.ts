/**
 * Identity's own narrow view of what it needs from `config` — domain/ never imports anything
 * from `modules/config/`. The top-level `apps/api/src/container.ts` passes `config.contract`
 * (typed `ConfigPublicContract`) into `buildIdentityContainer`; it satisfies this port
 * structurally. Only the composition root touches both modules' types.
 */
export interface ConfigProviderPort {
  get(key: string): Promise<string>;
}

/**
 * The approval module's narrow view of `config` — domain/ never imports `modules/config/`. The
 * top-level `container.ts` passes `config.contract`, which satisfies this structurally.
 */
export interface ConfigProviderPort {
  get(key: string): Promise<string>;
}

/** Comma-separated kinds that skip the final stage, or `NONE`. Seeded by `config`. */
export const MANAGER_ONLY_KINDS_KEY = 'APPROVAL_MANAGER_ONLY_KINDS';

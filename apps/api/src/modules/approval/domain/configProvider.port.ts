/**
 * The approval module's narrow view of `config` — domain/ never imports `modules/config/`. The
 * top-level `container.ts` passes `config.contract`, which satisfies this structurally.
 */
export interface ConfigProviderPort {
  get(key: string): Promise<string>;
}

/** Days an approver has to act before a request is flagged overdue. Seeded by `config`. */
export const APPROVAL_SLA_DAYS_KEY = 'APPROVAL_SLA_DAYS';

/** Comma-separated kinds that skip the final stage, or `NONE`. Seeded by `config`. */
export const MANAGER_ONLY_KINDS_KEY = 'APPROVAL_MANAGER_ONLY_KINDS';

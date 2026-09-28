/** Planning's narrow view of `config`; `config.contract` satisfies it structurally. */
export interface ConfigProviderPort {
  get(key: string): Promise<string>;
}

export const PLANNING_CONFIG_KEYS = {
  timeZone: 'BUSINESS_TIMEZONE',
  dailyCutoffTime: 'DAILY_PLAN_SUBMIT_CUTOFF_TIME',
  monthlyCutoffDay: 'MONTHLY_PLAN_SUBMIT_CUTOFF_DATE',
  grantByManager: 'LATE_PLAN_GRANT_BY_MANAGER',
  grantValidHours: 'LATE_PLAN_GRANT_VALID_HOURS',
} as const;

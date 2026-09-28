import type { SystemConfigSeed } from '../../domain/systemConfig.entity.js';
import type { SystemConfigRepositoryPort } from '../../domain/systemConfig.repository.port.js';

/**
 * Every known key, seeded even before the module that reads it exists (most are named in
 * docs/erd/05-planning-and-rules.md) — `Config`'s whole point is being the one source of truth,
 * and seeding early costs nothing. `upsertSeed` only adds missing keys, never overwrites a value
 * Admin has changed.
 */
const DEFAULT_CONFIG: SystemConfigSeed[] = [
  {
    key: 'DAILY_PLAN_SUBMIT_CUTOFF_TIME',
    value: '10:00',
    module: 'PLANNING',
    description: 'Time of day by which a Daily Plan must be submitted.',
  },
  {
    key: 'MONTHLY_PLAN_SUBMIT_CUTOFF_DATE',
    value: '28',
    module: 'PLANNING',
    description: 'Day of the month by which a Monthly Plan must be submitted.',
  },
  {
    key: 'BUSINESS_TIMEZONE',
    value: 'Asia/Kolkata',
    module: 'SYSTEM',
    description: 'IANA timezone every business deadline is read in (e.g. the Daily Plan cutoff time).',
  },
  {
    key: 'LATE_PLAN_GRANT_BY_MANAGER',
    value: 'false',
    module: 'PLANNING',
    description:
      'Whether a manager (not just Admin) may let someone in their team submit a Plan after its deadline.',
  },
  {
    key: 'LATE_PLAN_GRANT_VALID_HOURS',
    value: '24',
    module: 'PLANNING',
    description: 'Hours a late-submission exception stays usable after it is granted.',
  },
  {
    key: 'MAX_REGISTERED_DEVICES_FIELD',
    value: '2',
    module: 'AUTH',
    description: 'Max devices (registered + awaiting approval) for a FIELD-role user.',
  },
  {
    key: 'REJECTED_DEVICE_TTL_DAYS',
    value: '7',
    module: 'AUTH',
    description: 'Days a device rejected by Admin stays blocked before it can request approval again.',
  },
  {
    key: 'GEO_FENCE_RADIUS_METERS',
    value: '200',
    module: 'FIELD_ACTIVITY',
    description: 'Radius, in meters, a Dr/Chemist Call must be logged within.',
  },
  {
    key: 'DCR_MISS_BLOCK_ENABLED',
    value: 'true',
    module: 'FIELD_ACTIVITY',
    description: 'Whether missing DCR submissions triggers the compliance block.',
  },
  {
    key: 'DCR_MISS_GRACE_DAYS',
    value: '1',
    module: 'FIELD_ACTIVITY',
    description: 'Grace days before a missed DCR triggers the compliance block.',
  },
  {
    key: 'APPROVAL_MANAGER_ONLY_KINDS',
    value: 'NONE',
    module: 'APPROVAL',
    description:
      'Comma-separated approval kinds that end at the manager (no Admin/HR final stage), e.g. ' +
      '"DAILY_PLAN". NONE = every kind goes manager, then final approver. Applies from the next submission.',
  },
];

export class SeedDefaultConfigUseCase {
  constructor(private readonly repository: SystemConfigRepositoryPort) {}

  async execute(): Promise<void> {
    await this.repository.upsertSeed(DEFAULT_CONFIG);
  }
}

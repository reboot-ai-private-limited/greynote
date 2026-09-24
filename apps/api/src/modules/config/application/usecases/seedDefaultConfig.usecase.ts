import type { SystemConfigSeed } from '../../domain/systemConfig.entity.js';
import type { SystemConfigRepositoryPort } from '../../domain/systemConfig.repository.port.js';

/**
 * The known keys named in docs/erd/05-planning-and-rules.md. Seeded all six now even though only
 * `identity` reads one of them today — `Config`'s whole point is being the one source of truth,
 * and seeding the rest costs nothing.
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
];

export class SeedDefaultConfigUseCase {
  constructor(private readonly repository: SystemConfigRepositoryPort) {}

  async execute(): Promise<void> {
    await this.repository.upsertSeed(DEFAULT_CONFIG);
  }
}

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
    key: 'FY_START_MONTH',
    value: 'APRIL',
    module: 'SYSTEM',
    description: 'Month the financial year — and the leave year — starts in (JANUARY … DECEMBER).',
  },
  {
    key: 'WEEKLY_OFF_DAY',
    value: 'SUNDAY',
    module: 'SYSTEM',
    description: 'The weekly day off (SUNDAY … SATURDAY) — not counted inside a leave.',
  },
  {
    key: 'LEAVE_BACKDATE_DAYS',
    value: '30',
    module: 'HR',
    description: 'How many days back a leave may start (e.g. to cover a missed report).',
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
    key: 'DAILY_PLAN_RESUBMIT_GRACE_MINUTES',
    value: '30',
    module: 'PLANNING',
    description: 'After a rejection, minutes a Daily Plan may still be resubmitted past its deadline.',
  },
  {
    key: 'DAILY_PLAN_RESUBMIT_LATEST_TIME',
    value: '11:30',
    module: 'PLANNING',
    description: 'Time of day on the plan date after which a rejected Daily Plan can no longer be resubmitted.',
  },
  {
    key: 'MONTHLY_PLAN_RESUBMIT_GRACE_HOURS',
    value: '24',
    module: 'PLANNING',
    description: 'After a rejection, hours a Monthly Plan may still be resubmitted past its deadline (never after the month starts).',
  },
  {
    key: 'PLAN_RESUBMIT_GRACE_MAX',
    value: '2',
    module: 'PLANNING',
    description: 'Most resubmits per Plan allowed through the after-rejection window.',
  },
  {
    key: 'DOCTOR_VISIBILITY_FOLLOWS_ROUTE',
    value: 'true',
    module: 'FIELD_MASTER_DATA',
    description:
      'Whether an MR sees only the assigned Doctors on the Routes they currently have. Off: an MR keeps every assigned Doctor after a Route change.',
  },
  {
    key: 'AUTO_ASSIGN_DOCTOR_ON_APPROVAL',
    value: 'true',
    module: 'FIELD_MASTER_DATA',
    description: 'Whether approving a Doctor an MR added assigns that Doctor to the MR who added it.',
  },
  {
    key: 'NEW_DOCTOR_COVERAGE_WAIT_DAYS',
    value: '8',
    module: 'FIELD_MASTER_DATA',
    description: 'Days after approval before a new Doctor counts toward an MR’s coverage.',
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

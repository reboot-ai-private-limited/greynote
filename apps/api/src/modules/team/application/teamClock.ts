import {
  businessDate,
  parseCalendarDate,
  parseTimeOfDay,
  zonedInstant,
} from '@/shared/time/businessTime.js';
import { readBusinessDay, readConfigOr } from '@/shared/config/readConfig.js';
import type { TeamConfigPort } from '../domain/ports.js';

export const NOT_STARTED_AFTER_KEY = 'TEAM_NOT_STARTED_AFTER';
const DEFAULT_NOT_STARTED_AFTER = '11:00';

export interface TeamDay {
  /** Today in the business timezone. */
  today: string;
  /** The `HH:mm` after which "no activity yet" counts as not started. */
  notStartedAfter: string;
  /** Whether that time has passed on `today`. */
  pastThreshold: boolean;
}

/** What "today" is for the business and whether the not-started time has passed — read from Config on every call. */
export class TeamClock {
  constructor(
    private readonly config: TeamConfigPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async day(): Promise<TeamDay> {
    const { timeZone, dayStart } = await readBusinessDay(this.config);
    const now = this.now();
    const today = businessDate(now, timeZone, dayStart);
    const notStartedAfter = await readConfigOr(
      this.config,
      NOT_STARTED_AFTER_KEY,
      (v) => {
        parseTimeOfDay(v);
        return v;
      },
      DEFAULT_NOT_STARTED_AFTER,
    );
    const { hour, minute } = parseTimeOfDay(notStartedAfter);
    return {
      today,
      notStartedAfter,
      pastThreshold:
        now.getTime() >= zonedInstant(parseCalendarDate(today), hour, minute, timeZone).getTime(),
    };
  }
}

import type { ReminderRun } from './application/reminders.js';

export type { ReminderRun } from './application/reminders.js';

/** What the server's interval job calls. */
export interface RemindersPublicContract {
  /** One pass over every reminder stage that is due; safe to run often and from several servers. */
  run(): Promise<ReminderRun>;
}

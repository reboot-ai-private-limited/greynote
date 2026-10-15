import { Reminders } from './application/reminders.js';
import type { ApprovalsPort, CalendarPort, ConfigReader, ExpensesPort, InboxPort, PeoplePort, PlansPort, StockPort } from './domain/ports.js';
import { MongoReminderMarksAdapter } from './infrastructure/mongoReminderMarks.adapter.js';
import type { RemindersPublicContract } from './reminders.public.js';

export interface RemindersContainer {
  contract: RemindersPublicContract;
}

/** The public contracts of Identity, HR, Planning, Field Activity, Sales, Approval, Inbox and Config, passed in by the composition root. Owns only its dedupe marks. */
export function buildRemindersContainer(
  people: PeoplePort,
  calendar: CalendarPort,
  plans: PlansPort,
  expenses: ExpensesPort,
  stock: StockPort,
  approvals: ApprovalsPort,
  inbox: InboxPort,
  config: ConfigReader,
): RemindersContainer {
  const reminders = new Reminders(people, calendar, plans, expenses, stock, approvals, inbox, new MongoReminderMarksAdapter(), config);
  return { contract: { run: () => reminders.run() } };
}

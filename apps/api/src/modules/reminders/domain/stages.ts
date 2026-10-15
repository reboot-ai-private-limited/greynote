import { addDays, parseCalendarDate, parseTimeOfDay, zonedInstant } from '@/shared/time/businessTime.js';

export type Audience = 'EMPLOYEE' | 'MANAGER';

/** One reminder moment. It fires once, any time in `[at, until)`. */
export interface Stage {
  /** Unique within a period and audience; part of the dedupe key. */
  id: string;
  audience: Audience;
  at: Date;
  until: Date;
  /** `BEFORE` the deadline ("due in 2 hours") or `AFTER` it ("missed"). */
  phase: 'BEFORE' | 'AFTER';
  /** What fills "due …": `in 2 hours`, `tomorrow`, `in 3 days`. Empty after the deadline. */
  when: string;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
const minutesText = (m: number) => (m % 60 === 0 ? `in ${plural(m / 60, 'hour')}` : m > 60 ? `in ${plural(Math.round(m / 6) / 10, 'hour')}` : `in ${m} min`);
const daysText = (d: number) => (d === 1 ? 'tomorrow' : `in ${d} days`);

export interface DailyOffsets {
  firstMinutes: number;
  secondMinutes: number;
  afterMinutes: number;
}

/**
 * A Daily Plan, due at `deadline` the same day. The employee is reminded twice before it and told when it is missed; their manager
 * hears how many have not sent it at the first mark and again `afterMinutes` after the deadline.
 */
export function dailyStages(deadline: Date, o: DailyOffsets): Stage[] {
  const d = deadline.getTime();
  const sixHours = 6 * HOUR;
  return [
    { id: 'EMPLOYEE:first', audience: 'EMPLOYEE', phase: 'BEFORE', when: minutesText(o.firstMinutes), at: new Date(d - o.firstMinutes * MIN), until: new Date(d) },
    { id: 'EMPLOYEE:second', audience: 'EMPLOYEE', phase: 'BEFORE', when: minutesText(o.secondMinutes), at: new Date(d - o.secondMinutes * MIN), until: new Date(d) },
    { id: 'EMPLOYEE:missed', audience: 'EMPLOYEE', phase: 'AFTER', when: '', at: new Date(d), until: new Date(d + sixHours) },
    { id: 'MANAGER:first', audience: 'MANAGER', phase: 'BEFORE', when: minutesText(o.firstMinutes), at: new Date(d - o.firstMinutes * MIN), until: new Date(d) },
    { id: 'MANAGER:after', audience: 'MANAGER', phase: 'AFTER', when: '', at: new Date(d + o.afterMinutes * MIN), until: new Date(d + sixHours) },
  ];
}

export interface PeriodOffsets {
  firstDays: number;
  secondDays: number;
  /** `HH:mm` the day-based reminders go out. */
  sendTime: string;
}

/**
 * A deadline that is the end of calendar day `deadlineDate` (monthly plan, expenses, stock). Reminders go out at `sendTime` the given
 * days before that day, and the morning after it for "missed" — never at 23:59 on the deadline itself.
 */
export function periodStages(deadlineDate: string, deadline: Date, o: PeriodOffsets, timeZone: string, audiences: Audience[] = ['EMPLOYEE', 'MANAGER']): Stage[] {
  const { hour, minute } = parseTimeOfDay(o.sendTime);
  const at = (offset: number) => zonedInstant(parseCalendarDate(addDays(deadlineDate, offset)), hour, minute, timeZone);
  const stages: Stage[] = [];
  for (const audience of audiences) {
    stages.push(
      { id: `${audience}:first`, audience, phase: 'BEFORE', when: daysText(o.firstDays), at: at(-o.firstDays), until: deadline },
      { id: `${audience}:second`, audience, phase: 'BEFORE', when: daysText(o.secondDays), at: at(-o.secondDays), until: deadline },
      { id: `${audience}:after`, audience, phase: 'AFTER', when: '', at: at(1), until: new Date(at(1).getTime() + DAY) },
    );
  }
  return stages;
}

/**
 * Of the stages that are due now (`at <= now < until`) for one audience, the one to send is the latest. The earlier ones are still
 * claimed, so a server that was down at 08:00 and wakes at 09:50 sends one reminder, not two.
 */
export function dueStages(stages: Stage[], audience: Audience, now: Date): { send: Stage; all: Stage[] } | null {
  const due = stages
    .filter((s) => s.audience === audience && s.at.getTime() <= now.getTime() && now.getTime() < s.until.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  const send = due[due.length - 1];
  return send ? { send, all: due } : null;
}

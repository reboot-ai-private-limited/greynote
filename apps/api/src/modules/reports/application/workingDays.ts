import { addDays } from '@/shared/time/businessTime.js';
import type { WorkingCalendarPort } from '../domain/ports.js';

/**
 * How many days an employee was due to work in a range (2026-11-28, the call average's divisor): every day except their weekly off, the
 * holidays that apply to them and their approved leave (a half day counts half), from the day they joined. The days after `today` don't
 * count, and neither does today itself until its daily report is counted (`todayCounted`), so the average doesn't drop every morning.
 */
export async function workingDays(
  calendar: WorkingCalendarPort,
  userId: string,
  range: { from: string; to: string },
  today: string,
  todayCounted: boolean,
): Promise<number> {
  const lastDay = range.to < today ? range.to : todayCounted ? today : addDays(today, -1);
  const joined = await calendar.joinedOn(userId);
  const from = joined && joined > range.from ? joined : range.from;
  if (lastDay < from) return 0;
  const [off, leave] = await Promise.all([calendar.offDates(userId, from, lastDay), calendar.leaveDays(userId, from, lastDay)]);
  const offSet = new Set(off);
  const leaveOn = new Map<string, number>();
  for (const l of leave) leaveOn.set(l.date, Math.min(1, (leaveOn.get(l.date) ?? 0) + l.portion));
  let days = 0;
  for (let d = from; d <= lastDay; d = addDays(d, 1)) if (!offSet.has(d)) days += 1 - (leaveOn.get(d) ?? 0);
  return Math.round(days * 10) / 10;
}

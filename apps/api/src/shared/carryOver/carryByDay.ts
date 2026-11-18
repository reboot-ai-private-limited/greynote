/**
 * The carry-over of one person's month, day by day: a doctor planned on a day and not called that day is **owed** from the next day, until a call (planned or not) on
 * any later day clears him. Pure, so the team's day view and the Monthly Work report can never disagree. Feed it only what counts: `plannedIds` from an approved
 * Daily Plan, `calledIds` from a sent or approved report, days in date order and only the days that are over (or the day being looked at).
 */
export interface CarryDay {
  date: string;
  plannedIds: readonly string[];
  calledIds: readonly string[];
}

export interface CarryRow {
  date: string;
  /** Owed when the day started: planned earlier, not called since, with the day each was first planned. */
  carriedIn: Array<{ id: string; since: string }>;
  /** Planned today and not called today. */
  missed: string[];
  /** Planned today and called today. */
  visited: string[];
  /** Called today though not planned today. */
  alsoCalled: string[];
  /** Owed when the day ends: carried in plus today's misses, less anyone called today. */
  carriedOn: Array<{ id: string; since: string }>;
}

export function carryByDay(days: readonly CarryDay[]): CarryRow[] {
  const owed = new Map<string, string>(); // doctor id -> the day first planned
  const out: CarryRow[] = [];
  for (const day of days) {
    const called = new Set(day.calledIds);
    const planned = [...new Set(day.plannedIds)];
    const carriedIn = [...owed].map(([id, since]) => ({ id, since })).sort((a, b) => a.since.localeCompare(b.since));
    const missed = planned.filter((id) => !called.has(id));
    const visited = planned.filter((id) => called.has(id));
    const alsoCalled = [...called].filter((id) => !planned.includes(id));
    for (const id of missed) if (!owed.has(id)) owed.set(id, day.date);
    for (const id of called) owed.delete(id);
    out.push({ date: day.date, carriedIn, missed, visited, alsoCalled, carriedOn: [...owed].map(([id, since]) => ({ id, since })).sort((a, b) => a.since.localeCompare(b.since)) });
  }
  return out;
}

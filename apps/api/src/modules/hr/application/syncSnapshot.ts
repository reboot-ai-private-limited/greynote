import type { HrSnapshot } from '@greynote/contracts';
import type { SyncSourceDefinition } from '@/modules/sync/sync.public.js';
import type { HolidayRepositoryPort } from '../domain/holiday.repository.port.js';
import type { LeaveTypeRepositoryPort } from '../domain/leaveType.repository.port.js';
import type { TerritoryPort } from '../domain/territory.port.js';
import type { HrCalendar } from './hrCalendar.js';
import type { LeaveBalances } from './leaveBalances.js';

export const HR_SYNC_SOURCE = 'hr';

/**
 * What the MR's phone caches of HR (LLD sync.md, Pull): the active leave types, their own balances for the
 * current leave year, and the holidays that apply to them (National, their HQ's and its Zone's) across that
 * year — for the Holiday List and the leave screens. Leave *requests* need a connection and aren't here.
 * Reading the balances seeds them if this is the first time they're needed, as the balances screen does.
 */
export function makeHrSource(deps: {
  leaveTypes: LeaveTypeRepositoryPort;
  balances: LeaveBalances;
  holidays: HolidayRepositoryPort;
  territory: TerritoryPort;
  calendar: HrCalendar;
}): SyncSourceDefinition {
  return {
    name: HR_SYNC_SOURCE,
    async snapshot(userId): Promise<HrSnapshot> {
      const leaveYear = await deps.calendar.leaveYearOf(await deps.calendar.today());
      const range = await deps.calendar.leaveYearRange(leaveYear);
      const [types, balances, holidays, weeklyOffDay, backdateDays] = await Promise.all([
        deps.leaveTypes.list(),
        deps.balances.views(userId, leaveYear),
        deps.territory.getUserHq(userId).then((place) => deps.holidays.listApplicable(range.from, range.to, place)),
        deps.calendar.weeklyOff(),
        deps.calendar.backdateDays(),
      ]);
      return {
        leaveYear,
        leaveYearFrom: range.from,
        leaveYearTo: range.to,
        weeklyOffDay,
        leaveBackdateDays: backdateDays,
        leaveTypes: types.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name, isPaid: t.isPaid })).sort((a, b) => a.name.localeCompare(b.name)),
        balances: balances
          .map((b) => ({ leaveTypeId: b.leaveTypeId, leaveTypeName: b.leaveTypeName, allocatedDays: b.allocatedDays, usedDays: b.usedDays, pendingDays: b.pendingDays, availableDays: b.availableDays }))
          .sort((a, b) => a.leaveTypeName.localeCompare(b.leaveTypeName)),
        holidays: holidays.map((h) => ({ name: h.name, date: h.date, scope: h.scope })).sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name)),
      };
    },
  };
}

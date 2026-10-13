import type { HrPublicContract } from '@/modules/hr/hr.public.js';

/** What the missed-DCR job asks of HR: is the day covered by leave, and is it a day off anyway. */
export type LeavePort = Pick<HrPublicContract, 'isOnLeave' | 'listOffDates' | 'listLeaveDays' | 'listHolidayDates'>;

import type { DcrStatusName, FieldActivitySnapshot } from '@greynote/contracts';
import type { SyncSourceDefinition } from '@/modules/sync/sync.public.js';
import { addDays } from '@/shared/time/businessTime.js';
import type { UserDirectoryPort } from '../domain/userDirectory.port.js';
import type { DcrClock } from './dcrClock.js';
import type { GetDcrSummaryUseCase } from './usecases/getDcrSummary.usecase.js';
import type { ListDoctorServicesUseCase, ListGiftsUseCase } from './usecases/servicesAndGifts.usecase.js';

export const FIELD_ACTIVITY_SYNC_SOURCE = 'fieldActivity';

/** How many days of daily reports the phone keeps, counting today. */
const DAYS_BACK = 7;
const SERVICES_LIMIT = 100;
const GIFTS_LIMIT = 200;

/**
 * What the MR's phone caches of Field Activity (LLD sync.md, Pull): the compliance-block flag, the last week's
 * reports with status and money, their Doctor Services with status, and the gifts still to give. Only the caller's
 * own — the user is the token's. Deterministic: sorted by date or id, and nothing that changes on its own (no
 * timestamps of creation, no counters). Left out: geofence results, expense lines, other people's anything.
 */
export function makeFieldActivitySource(deps: {
  clock: DcrClock;
  users: UserDirectoryPort;
  summary: GetDcrSummaryUseCase;
  services: ListDoctorServicesUseCase;
  gifts: ListGiftsUseCase;
}): SyncSourceDefinition {
  return {
    name: FIELD_ACTIVITY_SYNC_SOURCE,
    async snapshot(userId): Promise<FieldActivitySnapshot> {
      const today = await deps.clock.today();
      const actor = { id: userId, role: 'FIELD' as const };
      const [blocked, summaries, services, gifts] = await Promise.all([
        deps.users.isBlocked(userId),
        deps.summary.execute(userId, { from: addDays(today, -(DAYS_BACK - 1)), to: today }),
        deps.services.execute(actor, {}, SERVICES_LIMIT),
        deps.gifts.execute(actor, { status: 'PENDING' }, GIFTS_LIMIT),
      ]);
      return {
        blocked,
        today,
        dcrs: summaries
          .map((s) => ({
            id: s.dcrId,
            reportDate: s.reportDate,
            status: s.status as DcrStatusName,
            approvalRequestId: s.approvalRequestId,
            doctorCalls: s.doctorCalls,
            chemistCalls: s.chemistCalls,
            followups: s.followups,
            taPaise: s.taPaise,
            daPaise: s.daPaise,
            otherExpensesPaise: s.otherExpensesPaise,
            paidPaise: s.paidPaise,
          }))
          .sort((a, b) => a.reportDate.localeCompare(b.reportDate)),
        doctorServices: services.map((s) => ({
          id: s.id,
          doctorId: s.doctorId,
          serviceType: s.serviceType,
          amountPaise: s.amountPaise,
          remarks: s.remarks,
          origin: s.origin,
          status: s.status as DcrStatusName,
          approvalRequestId: s.approval?.requestId ?? null,
        })),
        pendingGifts: gifts.map((g) => ({ id: g.id, doctorId: g.doctorId, productName: g.productName, amountPaise: g.amountPaise })),
      };
    },
  };
}

import type {
  DownlineEntry,
  TeamBlockPort,
  TeamConfigPort,
  TeamDirectoryPort,
  TeamFieldActivityPort,
  TeamHrPort,
  TeamLeaveEntry,
  TeamMasterPort,
  TeamOrder,
  TeamPlanningPort,
  TeamPlanRoute,
  TeamRoutesPort,
  TeamSalesPort,
} from '../../domain/ports.js';
import { AppError } from '@/shared/errors/AppError.js';
import { TeamClock } from '../teamClock.js';

export const person = (
  id: string,
  depth: number,
  managerId: string,
  status: DownlineEntry['status'] = 'active',
): DownlineEntry => ({
  id,
  employeeCode: id.toUpperCase(),
  name: `Person ${id}`,
  managerId,
  status,
  depth,
});

/** The RSM's team: two ASMs (depth 1) and their MRs (depth 2, one of whom has left). */
export const rsmDownline = [
  person('asm1', 1, 'rsm'),
  person('asm2', 1, 'rsm'),
  person('mr1', 2, 'asm1'),
  person('mr2', 2, 'asm1'),
  person('gone', 2, 'asm1', 'inactive'),
];

export class FakeTeam
  implements
    TeamDirectoryPort,
    TeamBlockPort,
    TeamPlanningPort,
    TeamRoutesPort,
    TeamFieldActivityPort,
    TeamHrPort,
    TeamSalesPort,
    TeamMasterPort
{
  blocked = new Set<string>();
  plans = new Map<
    string,
    { status: string; workingType: string; routeIds: string[]; doctorIds: string[] }
  >();
  monthly = new Map<string, string>();
  /** Route types; a route not listed is `HQ`, and `gone` is unknown. */
  routeTypes = new Map<string, TeamPlanRoute['routeType']>();
  dcrs = new Map<
    string,
    { status: string; doctorCalls: number; chemistCalls: number; followups: number }
  >();
  leaves: TeamLeaveEntry[] = [];
  off = new Set<string>();
  orders: TeamOrder[] = [];
  /** Per user, the outlets with no stock count. */
  missing = new Map<string, Array<{ type: 'CHEMIST' | 'DISTRIBUTOR'; id: string; name: string }>>();
  secondary = new Map<string, 'NOT_ENTERED' | 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED'>();
  async listOrders(f: {
    from?: string;
    to?: string;
    status?: TeamOrder['status'];
    userId?: string;
    limit?: number;
  }) {
    return this.orders
      .filter(
        (o) =>
          (!f.userId || o.userId === f.userId) &&
          (!f.status || o.status === f.status) &&
          (!f.from || o.orderDate >= f.from) &&
          (!f.to || o.orderDate <= f.to),
      )
      .slice(0, f.limit);
  }
  async listMissingStock(_month: string, userIds?: string[]) {
    return [...this.missing]
      .filter(([id]) => !userIds || userIds.includes(id))
      .map(([userId, outlets]) => ({ userId, outlets }));
  }
  async listSecondaryStatus(_month: string, userIds: string[]) {
    return userIds.map((userId) => ({
      userId,
      status: this.secondary.get(userId) ?? ('NOT_ENTERED' as const),
    }));
  }
  async listNames(q: { distributorIds?: string[]; chemistIds?: string[] }) {
    return {
      distributors: (q.distributorIds ?? [])
        .filter((id) => id !== 'gone')
        .map((id) => ({ id, name: `Dist ${id}` })),
      chemists: (q.chemistIds ?? []).map((id) => ({ id, name: `Chem ${id}` })),
    };
  }
  async getDownline(managerId: string) {
    return managerId === 'rsm' ? rsmDownline : [];
  }
  async listFieldEmployees() {
    return [];
  }
  async isBlocked(userId: string) {
    return this.blocked.has(userId);
  }
  async getDailyPlanDay(userId: string, date: string) {
    return this.plans.get(`${userId}|${date}`) ?? null;
  }
  async getMonthlyPlanStatus(userId: string, month: string) {
    return this.monthly.get(`${userId}|${month}`) ?? null;
  }
  async getRoute(routeId: string): Promise<TeamPlanRoute | null> {
    if (routeId === 'gone') return null;
    return { id: routeId, name: `Route ${routeId}`, routeType: this.routeTypes.get(routeId) ?? 'HQ' };
  }
  async getDcrSummary(userId: string, range: { from: string }) {
    const d = this.dcrs.get(`${userId}|${range.from}`);
    return d ? [d] : [];
  }
  async listLeavesForUsers(userIds: string[], from: string, to: string) {
    return this.leaves.filter(
      (l) => userIds.includes(l.userId) && l.startDate <= to && l.endDate >= from,
    );
  }
  async listOffDates(userId: string, from: string) {
    return this.off.has(`${userId}|${from}`) ? [from] : [];
  }
}

/** 2026-10-12 is a Monday. In IST, 04:30Z is 10:00 (before the 11:00 default) and 06:30Z is 12:00 (after). */
export const clockAt = (iso: string, settings: Record<string, string> = {}): TeamClock => {
  const values: Record<string, string> = {
    BUSINESS_TIMEZONE: 'Asia/Kolkata',
    DAY_START_TIME: '00:00',
    ...settings,
  };
  const config: TeamConfigPort = {
    get: async (key) => {
      const v = values[key];
      if (v === undefined)
        throw AppError.internal('INTERNAL', { reason: 'CONFIG_KEY_MISSING', key });
      return v;
    },
  };
  return new TeamClock(config, () => new Date(iso));
};

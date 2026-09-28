import type { Holiday } from '../../domain/holiday.entity.js';
import { holidayApplies } from '../../domain/holiday.entity.js';
import type { HolidayFilter, HolidayRepositoryPort } from '../../domain/holiday.repository.port.js';
import type { LeavePolicy } from '../../domain/leavePolicy.entity.js';
import type { LeavePolicyRepositoryPort } from '../../domain/leavePolicy.repository.port.js';
import type { LeaveType } from '../../domain/leaveType.entity.js';
import type { LeaveTypeRepositoryPort } from '../../domain/leaveType.repository.port.js';
import type { TerritoryPort } from '../../domain/territory.port.js';
import type { DirectoryUser, UserDirectoryPort } from '../../domain/userDirectory.port.js';

/** In-memory fakes for HR's use-case tests — no Mongo, no other module's internals. */

export class FakeLeaveTypes implements LeaveTypeRepositoryPort {
  rows: LeaveType[] = [];
  async list() {
    return [...this.rows];
  }
  async findById(id: string) {
    return this.rows.find((t) => t.id === id) ?? null;
  }
  private taken(name: string, exceptId?: string) {
    return this.rows.some((t) => t.id !== exceptId && t.name.toLowerCase() === name.trim().toLowerCase());
  }
  async create(input: Omit<LeaveType, 'id'>) {
    if (this.taken(input.name)) return null;
    const row = { ...input, id: `type-${this.rows.length + 1}` };
    this.rows.push(row);
    return row;
  }
  async update(id: string, change: Partial<Omit<LeaveType, 'id'>>) {
    if (change.name !== undefined && this.taken(change.name, id)) return null;
    const i = this.rows.findIndex((t) => t.id === id);
    if (i < 0) return null;
    this.rows[i] = { ...this.rows[i]!, ...change };
    return this.rows[i]!;
  }
  async seed(defaults: Array<Pick<LeaveType, 'name' | 'isPaid'>>) {
    for (const d of defaults) if (!this.taken(d.name)) await this.create({ ...d, active: true });
  }
}

export class FakePolicies implements LeavePolicyRepositoryPort {
  rows: LeavePolicy[] = [];
  async list() {
    return [...this.rows];
  }
  async listForPayBand(payBandId: string) {
    return this.rows.filter((p) => p.payBandId === payBandId);
  }
  async upsert(input: Omit<LeavePolicy, 'id' | 'updatedAt'>) {
    const i = this.rows.findIndex((p) => p.payBandId === input.payBandId && p.leaveTypeId === input.leaveTypeId);
    const row = { ...input, id: i >= 0 ? this.rows[i]!.id : `policy-${this.rows.length + 1}`, updatedAt: new Date() };
    if (i >= 0) this.rows[i] = row;
    else this.rows.push(row);
    return row;
  }
  async existsForLeaveType(leaveTypeId: string) {
    return this.rows.some((p) => p.leaveTypeId === leaveTypeId);
  }
}

export class FakeHolidays implements HolidayRepositoryPort {
  rows: Holiday[] = [];
  async findById(id: string) {
    return this.rows.find((h) => h.id === id) ?? null;
  }
  async list(f: HolidayFilter) {
    return this.rows
      .filter(
        (h) =>
          h.date >= f.from &&
          h.date <= f.to &&
          (!f.scope || h.scope === f.scope) &&
          (!f.zoneId || h.zoneIds.includes(f.zoneId)) &&
          (!f.hqId || h.hqIds.includes(f.hqId)),
      )
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  async listApplicable(from: string, to: string, place: { hqId: string; zoneId: string } | null) {
    return this.rows.filter((h) => h.date >= from && h.date <= to && holidayApplies(h, place)).sort((a, b) => a.date.localeCompare(b.date));
  }
  async create(input: Omit<Holiday, 'id' | 'createdAt'>) {
    const row = { ...input, id: `holiday-${this.rows.length + 1}`, createdAt: new Date() };
    this.rows.push(row);
    return row;
  }
  async delete(id: string) {
    const before = this.rows.length;
    this.rows = this.rows.filter((h) => h.id !== id);
    return this.rows.length < before;
  }
}

export class FakeUsers implements UserDirectoryPort {
  users = new Map<string, DirectoryUser & { managerId: string | null; payBandId: string | null; dateOfJoining: Date | null }>();
  payBands = [
    { id: 'band-g1', name: 'G1' },
    { id: 'band-g2', name: 'G2' },
  ];
  add(
    id: string,
    opts: { role?: DirectoryUser['role']; managerId?: string | null; payBandId?: string | null; dateOfJoining?: string | null } = {},
  ) {
    this.users.set(id, {
      id,
      name: id,
      employeeCode: id.toUpperCase(),
      role: opts.role ?? 'FIELD',
      status: 'active',
      managerId: opts.managerId ?? null,
      payBandId: opts.payBandId === undefined ? 'band-g1' : opts.payBandId,
      dateOfJoining: opts.dateOfJoining ? new Date(`${opts.dateOfJoining}T00:00:00+05:30`) : null,
    });
  }
  async findUserSummary(id: string) {
    return this.users.get(id) ?? null;
  }
  async getManagerChain(userId: string) {
    const chain: DirectoryUser[] = [];
    let next = this.users.get(userId)?.managerId ?? null;
    while (next) {
      const m = this.users.get(next);
      if (!m) break;
      chain.push(m);
      next = m.managerId;
    }
    return chain;
  }
  async getDownline(managerId: string) {
    const below: DirectoryUser[] = [];
    const walk = (id: string) => {
      for (const u of this.users.values()) {
        if (u.managerId !== id) continue;
        below.push(u);
        walk(u.id);
      }
    };
    walk(managerId);
    return below;
  }
  async getEmploymentDetails(userId: string) {
    const u = this.users.get(userId);
    return u && u.role === 'FIELD' ? { payBandId: u.payBandId, dateOfJoining: u.dateOfJoining } : null;
  }
  async listPayBands() {
    return this.payBands;
  }
}

export class FakeTerritory implements TerritoryPort {
  userHq = new Map<string, { hqId: string; zoneId: string }>();
  hqs = new Map([
    ['hq-slg', 'active'],
    ['hq-jpg', 'active'],
    ['hq-old', 'inactive'],
  ] as const);
  zones = new Map([
    ['zone-wb', 'active'],
    ['zone-as', 'active'],
  ] as const);
  async getUserHq(userId: string) {
    return this.userHq.get(userId) ?? null;
  }
  async getHq(id: string) {
    const status = this.hqs.get(id as never);
    return status ? { id, status } : null;
  }
  async getZone(id: string) {
    const status = this.zones.get(id as never);
    return status ? { id, status } : null;
  }
}

export class FakeConfig {
  values: Record<string, string> = {
    BUSINESS_TIMEZONE: 'Asia/Kolkata',
    FY_START_MONTH: 'APRIL',
    WEEKLY_OFF_DAY: 'SUNDAY',
    LEAVE_BACKDATE_DAYS: '30',
  };
  async get(key: string) {
    const value = this.values[key];
    if (value === undefined) throw new Error(`missing ${key}`);
    return value;
  }
}

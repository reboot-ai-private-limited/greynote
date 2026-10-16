import type { ApprovalKindDefinition, ApprovalRequest, ApprovalStatus } from '@/modules/approval/approval.public.js';
import { isEditableBySubmitter } from '@/modules/approval/approval.public.js';
import type { TransactionRunnerPort } from '@/shared/db/transaction.port.js';
import type { ApprovalsPort } from '../../domain/approvals.port.js';
import type { Holiday } from '../../domain/holiday.entity.js';
import type { Leave, LeaveAttachment } from '../../domain/leave.entity.js';
import type { LeaveBody, LeaveFilter, LeaveRepositoryPort } from '../../domain/leave.repository.port.js';
import type { LeaveApprovalGrant } from '../../domain/leaveApprovalGrant.entity.js';
import type { LeaveApprovalGrantRepositoryPort } from '../../domain/leaveApprovalGrant.repository.port.js';
import type { LeaveBalance } from '../../domain/leaveBalance.entity.js';
import type { BalanceKey, LeaveBalanceRepositoryPort } from '../../domain/leaveBalance.repository.port.js';
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
  async seed(defaults: Array<Pick<LeaveType, 'name' | 'isPaid' | 'allowsProof'>>) {
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
  async listApplicable(from: string, to: string, place: { hqIds: string[]; zoneIds: string[] } | null) {
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
  users = new Map<string, DirectoryUser & { managerId: string | null; payBandId: string | null; dateOfJoining: Date | null; onProbation: boolean; probationMonths: number | null }>();
  payBands = [
    { id: 'band-g1', name: 'G1' },
    { id: 'band-g2', name: 'G2' },
  ];
  add(
    id: string,
    opts: { role?: DirectoryUser['role']; managerId?: string | null; payBandId?: string | null; dateOfJoining?: string | null; onProbation?: boolean; probationMonths?: number | null } = {},
  ) {
    this.users.set(id, {
      id,
      name: id,
      employeeCode: id.toUpperCase(),
      role: opts.role ?? 'FIELD',
      status: 'active',
      managerId: opts.managerId ?? null,
      payBandId: opts.payBandId === undefined ? 'band-g1' : opts.payBandId,
      onProbation: opts.onProbation ?? opts.probationMonths !== undefined,
      probationMonths: opts.probationMonths ?? null,
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
    return u && u.role === 'FIELD' ? { payBandId: u.payBandId, dateOfJoining: u.dateOfJoining, onProbation: u.onProbation, probationMonths: u.probationMonths } : null;
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
  async getUserTerritory(userId: string) {
    const place = this.userHq.get(userId);
    return place ? { hqIds: [place.hqId], zoneIds: [place.zoneId] } : null;
  }
  async getHq(id: string) {
    const status = this.hqs.get(id as never);
    return status ? { id, status } : null;
  }
  async getZone(id: string) {
    const status = this.zones.get(id as never);
    return status ? { id, status } : null;
  }
  async findZoneByName(name: string) {
    const id = { 'west bengal': 'zone-wb', assam: 'zone-as' }[name.toLowerCase()];
    return id ? this.getZone(id) : null;
  }
  async findHqByName(zoneId: string, name: string) {
    const id = ({ 'zone-wb/siliguri': 'hq-slg', 'zone-wb/jalpaiguri': 'hq-jpg', 'zone-wb/old': 'hq-old' } as Record<string, string>)[`${zoneId}/${name.toLowerCase()}`];
    return id ? this.getHq(id) : null;
  }
}

export class FakeConfig {
  values: Record<string, string> = {
    BUSINESS_TIMEZONE: 'Asia/Kolkata', DAY_START_TIME: '00:00', FY_CLOSED_YEARS: 'NONE',
    FY_START_MONTH: 'APRIL',
    WEEKLY_OFF_DAY: 'SUNDAY',
    LEAVE_BACKDATE_DAYS: '30',
    LATE_LEAVE_GRANT_VALID_HOURS: '24',
    LATE_LEAVE_GRANT_MAX_HOURS: '168',
    PROBATION_LEAVE_PAID: 'true',
    PROBATION_MONTHS: '6',
    LEAVE_LOCKED_AFTER_PAYROLL: 'true',
  };
  async get(key: string) {
    const value = this.values[key];
    if (value === undefined) throw new Error(`missing ${key}`);
    return value;
  }
}

export class FakeBalances implements LeaveBalanceRepositoryPort {
  rows: LeaveBalance[] = [];
  private match = (k: BalanceKey) => (b: LeaveBalance) => b.userId === k.userId && b.leaveTypeId === k.leaveTypeId && b.year === k.year;
  async listForUser(userId: string, year: number) {
    return this.rows.filter((b) => b.userId === userId && b.year === year);
  }
  async find(key: BalanceKey) {
    return this.rows.find(this.match(key)) ?? null;
  }
  async insertMissing(rows: Array<BalanceKey & { allocatedDays: number }>) {
    for (const r of rows) {
      if (this.rows.some(this.match(r))) continue;
      this.rows.push({ ...r, id: `bal-${this.rows.length + 1}`, usedDays: 0, pendingDays: 0, adjustedBy: null, adjustedAt: null, adjustReason: null });
    }
  }
  async setAllocated(key: BalanceKey, allocatedDays: number, by: string, reason: string) {
    const b = this.rows.find(this.match(key));
    if (!b || allocatedDays < b.usedDays + b.pendingDays) return null;
    Object.assign(b, { allocatedDays, adjustedBy: by, adjustedAt: new Date(), adjustReason: reason });
    return b;
  }
  async existsForLeaveType(leaveTypeId: string) {
    return this.rows.some((b) => b.leaveTypeId === leaveTypeId);
  }
  async reserve(key: BalanceKey, days: number, _ctx?: unknown) {
    const b = this.rows.find(this.match(key));
    if (!b || b.allocatedDays - b.usedDays - b.pendingDays < days) return false;
    b.pendingDays += days;
    return true;
  }
  private must(key: BalanceKey) {
    const b = this.rows.find(this.match(key));
    if (!b) throw new Error('LEAVE_BALANCE_MISSING');
    return b;
  }
  async release(key: BalanceKey, days: number, _ctx?: unknown) {
    this.must(key).pendingDays -= days;
  }
  async consume(key: BalanceKey, days: number, _ctx?: unknown) {
    const b = this.must(key);
    b.pendingDays -= days;
    b.usedDays += days;
  }
  async giveBack(key: BalanceKey, days: number, _ctx?: unknown) {
    this.must(key).usedDays -= days;
  }
}

/** A settable clock. */
export class Clock {
  constructor(public current: Date) {}
  now = () => this.current;
}

export class FakeLeaves implements LeaveRepositoryPort {
  rows: Leave[] = [];
  async findById(id: string) {
    return this.rows.find((l) => l.id === id) ?? null;
  }
  async listOverlapping(userId: string, from: string, to: string) {
    return this.rows.filter((l) => l.userId === userId && l.startDate <= to && l.endDate >= from);
  }
  async listStartingBetween(from: string, before: string) {
    return this.rows.filter((l) => l.startDate >= from && l.startDate < before);
  }
  async list(filter: LeaveFilter, page: { page: number; pageSize: number }) {
    const items = this.rows.filter(
      (l) =>
        (!filter.userIds || filter.userIds.includes(l.userId)) &&
        (!filter.to || l.startDate <= filter.to) &&
        (!filter.from || l.endDate >= filter.from),
    );
    return { items: items.slice((page.page - 1) * page.pageSize, page.page * page.pageSize), total: items.length };
  }
  async create(userId: string, body: LeaveBody) {
    const row: Leave = { ...body, attachments: [], id: `leave-${this.rows.length + 1}`, userId, revision: 1, createdAt: new Date(), updatedAt: new Date() };
    this.rows.push(row);
    return row;
  }
  async replace(id: string, expectedRevision: number, body: LeaveBody) {
    const i = this.rows.findIndex((l) => l.id === id && l.revision === expectedRevision);
    if (i < 0) return null;
    this.rows[i] = { ...this.rows[i]!, ...body, revision: expectedRevision + 1, updatedAt: new Date() };
    return this.rows[i]!;
  }
  async existsForLeaveType(leaveTypeId: string) {
    return this.rows.some((l) => l.leaveTypeId === leaveTypeId);
  }
  private nextAttachment = 1;
  async addAttachment(leaveId: string, attachment: Omit<LeaveAttachment, 'id'>, max: number) {
    const row = this.rows.find((l) => l.id === leaveId);
    if (!row || row.attachments.length >= max) return null;
    row.attachments.push({ ...attachment, id: `att-${this.nextAttachment++}` });
    return row;
  }
  async removeAttachment(leaveId: string, attachmentId: string) {
    const row = this.rows.find((l) => l.id === leaveId);
    const i = row?.attachments.findIndex((a) => a.id === attachmentId) ?? -1;
    return row && i >= 0 ? row.attachments.splice(i, 1)[0]! : null;
  }
}

/** Submit/resubmit, and decisions that fire the registered kind's `onStatusChange` like the real module. */
export class FakeApprovals implements ApprovalsPort {
  kinds = new Map<string, ApprovalKindDefinition>();
  requests = new Map<string, ApprovalRequest>();
  registerKind(definition: ApprovalKindDefinition) {
    this.kinds.set(definition.kind, definition);
  }
  async submit(input: { kind: string; recordId: string; submitterId: string }) {
    const key = `${input.kind}:${input.recordId}`;
    const existing = this.requests.get(key);
    if (existing && !isEditableBySubmitter(existing.status)) throw new Error('not editable');
    const request: ApprovalRequest = {
      id: existing?.id ?? `req-${this.requests.size + 1}`,
      kind: input.kind,
      recordId: input.recordId,
      submitterId: input.submitterId,
      status: 'SUBMITTED',
      workflow: 'MANAGER_THEN_FINAL',
      cycle: (existing?.cycle ?? 0) + 1,
      submittedAt: new Date(),
      decidedAt: null,
      history: [],
    };
    this.requests.set(key, request);
    return request;
  }
  async getForRecord(kind: string, recordId: string) {
    return this.requests.get(`${kind}:${recordId}`) ?? null;
  }
  async listForRecords(kind: string, recordIds: string[]) {
    return recordIds.flatMap((id) => this.requests.get(`${kind}:${id}`) ?? []);
  }
  async autoReject(kind: string, recordId: string, _reason: string) {
    const request = this.requests.get(`${kind}:${recordId}`);
    if (!request || (request.status !== 'SUBMITTED' && request.status !== 'MANAGER_APPROVED')) return false;
    await this.move(kind, recordId, 'REJECTED');
    return true;
  }
  /** Move a request to `status`, running the owner's callback as the approval module would. */
  async move(kind: string, recordId: string, status: ApprovalStatus) {
    const key = `${kind}:${recordId}`;
    const request = this.requests.get(key)!;
    const updated = { ...request, status };
    await this.kinds.get(kind)?.onStatusChange?.(
      {
        requestId: request.id,
        kind,
        recordId,
        submitterId: request.submitterId,
        previousStatus: request.status,
        status,
        action: { action: 'APPROVE', authority: 'MANAGER', actorId: 'x', actorRole: 'FIELD', comment: null, at: new Date(), resultingStatus: status, cycle: request.cycle },
        request: updated,
      },
      {},
    );
    this.requests.set(key, updated);
  }
}

export const inlineTransactions: TransactionRunnerPort = { run: (fn) => fn({}) };

export class FakeLeaveApprovalGrants implements LeaveApprovalGrantRepositoryPort {
  rows: LeaveApprovalGrant[] = [];
  async findUsable(leaveId: string, now: Date) {
    return this.rows.find((g) => g.leaveId === leaveId && g.status === 'OPEN' && g.expiresAt > now) ?? null;
  }
  async create(input: Omit<LeaveApprovalGrant, 'id' | 'status' | 'usedAt' | 'revokedAt' | 'revokedBy'>, now: Date) {
    for (const g of this.rows) if (g.leaveId === input.leaveId && g.status === 'OPEN' && g.expiresAt <= now) g.status = 'EXPIRED';
    if (this.rows.some((g) => g.leaveId === input.leaveId && g.status === 'OPEN')) return null;
    const grant: LeaveApprovalGrant = { ...input, id: `grant-${this.rows.length + 1}`, status: 'OPEN', usedAt: null, revokedAt: null, revokedBy: null };
    this.rows.push(grant);
    return grant;
  }
  async consume(id: string, now: Date) {
    const g = this.rows.find((r) => r.id === id && r.status === 'OPEN' && r.expiresAt > now);
    if (!g) return false;
    g.status = 'USED';
    g.usedAt = now;
    return true;
  }
  async revokeForLeave(leaveId: string, revokedBy: string, now: Date) {
    const g = await this.findUsable(leaveId, now);
    if (!g) return null;
    g.status = 'REVOKED';
    g.revokedAt = now;
    g.revokedBy = revokedBy;
    return g;
  }
}

import type { WorkingType } from '@greynote/contracts';
import type { ApprovalKindDefinition, ApprovalRequest, ApprovalStatus } from '@/modules/approval/approval.public.js';
import { isEditableBySubmitter } from '@/modules/approval/approval.public.js';
import { AppError } from '@/shared/errors/AppError.js';
import type { ConfigReader } from '@/shared/config/readConfig.js';
import type { ApprovalsPort } from '../../domain/approvals.port.js';
import type { Dcr } from '../../domain/dcr.entity.js';
import type { DcrRepositoryPort } from '../../domain/dcr.repository.port.js';
import type { PlanningPort } from '../../domain/planning.port.js';
import type { ChemistCall, DoctorCall, Followup } from '../../domain/call.entity.js';
import type { DoctorGift, DoctorService } from '../../domain/serviceGift.entity.js';
import type { Expense } from '../../domain/expense.entity.js';
import type { FieldMasterDataPort } from '../../domain/fieldMasterData.port.js';
import type { ChemistCallRepositoryPort, DoctorCallRepositoryPort, DoctorGiftRepositoryPort, DoctorServiceRepositoryPort, ExpenseBucket, ExpenseMonthSummary, ExpenseRepositoryPort, ExpenseStatement, FollowupRepositoryPort } from '../../domain/records.repository.port.js';
import type { LeavePort } from '../../domain/leave.port.js';
import type { TerritoryPort } from '../../domain/territory.port.js';
import type { DirectoryUser, UserDirectoryPort } from '../../domain/userDirectory.port.js';
import { CallChecks } from '../callChecks.js';
import { GeofenceEvaluator } from '../geofenceEvaluator.js';
import { AllocateGiftUseCase, CreateAdminDoctorServiceUseCase, MarkGiftDoneUseCase, SubmitDoctorServiceUseCase } from './servicesAndGifts.usecase.js';
import { GetPaidTaDaTotalUseCase, ListExpensesUseCase, MarkExpensePaidUseCase } from './accountantExpenses.usecase.js';
import { GetDcrSummaryUseCase } from './getDcrSummary.usecase.js';
import { HasQualifyingDcrUseCase } from './hasQualifyingDcr.usecase.js';
import { RunMissedDcrCheckUseCase } from './runMissedDcrCheck.usecase.js';
import { TaDaLifecycle } from './taDaLifecycle.usecase.js';
import { LogExpenseUseCase } from './logExpense.usecase.js';
import { LogChemistCallUseCase, LogDoctorCallUseCase, LogFollowupUseCase } from './logCalls.usecase.js';
import { DcrClock } from '../dcrClock.js';
import { DcrViews } from '../dcrViews.js';
import { LoggingGate } from '../loggingGate.js';
import { SubmitDcrUseCase } from './submitDcr.usecase.js';

/** In-memory fakes for Field Activity's use-case tests — no Mongo, no other module's internals. */

export class FakeUsers implements UserDirectoryPort {
  users = new Map<string, DirectoryUser & { managerId: string | null; blocked: boolean }>();
  constructor() {
    this.add('admin', { role: 'ADMIN' });
    this.add('asm');
    this.add('mr1', { managerId: 'asm' });
    this.add('mr2', { managerId: 'asm' });
    this.add('stranger');
  }
  add(id: string, o: { role?: DirectoryUser['role']; managerId?: string | null } = {}) {
    this.users.set(id, { id, name: id, employeeCode: id.toUpperCase(), role: o.role ?? 'FIELD', status: 'active', managerId: o.managerId ?? null, blocked: false });
  }
  async findUserSummary(id: string) {
    return this.users.get(id) ?? null;
  }
  async getUserSummaries(ids: string[]) {
    return ids.flatMap((id) => this.users.get(id) ?? []);
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
    return [...this.users.values()].filter((u) => u.managerId === managerId);
  }
  async isBlocked(userId: string) {
    return this.users.get(userId)?.blocked ?? false;
  }
  joined = new Map<string, Date>();
  clearedAt = new Map<string, Date>();
  blockCalls: Array<{ userId: string; reason: string }> = [];
  failBlockFor = new Set<string>();
  async listActiveFieldUserIds() {
    return [...this.users.values()].filter((u) => u.role === 'FIELD' && u.status === 'active' && !['asm', 'stranger'].includes(u.id)).map((u) => u.id);
  }
  async getLastBlockClearedAt(userId: string) {
    return this.clearedAt.get(userId) ?? null;
  }
  async blockUser(userId: string, reason: string) {
    if (this.failBlockFor.has(userId)) throw new Error('boom');
    const u = this.users.get(userId)!;
    if (u.blocked) return false;
    u.blocked = true;
    this.blockCalls.push({ userId, reason });
    return true;
  }
  async getEmploymentDetails(userId: string) {
    return { dateOfJoining: this.joined.get(userId) ?? null };
  }
  /** G1-like: ₹7.50/km; DA ₹0 at HQ and (here) ex-station, ₹500 out-station. route-1 is an ex-station Route, because an HQ Route earns no TA, ₹500 out-station. */
  rates = { taPerKmRatePaise: 750, hqDaPaise: 0, exStationDaPaise: 0, outStationDaPaise: 50000 };
  async getPayBandRates() {
    return this.rates;
  }
}

export class FakePlanning implements PlanningPort {
  approved = new Set<string>();
  /** An approved day defaults to field work on route-1, where the fixtures' Doctor and Chemist are; a test can set `days` itself. */
  approve(userId: string, date: string) {
    this.approved.add(`${userId}:${date}`);
    if (!this.days.has(`${userId}:${date}`)) this.days.set(`${userId}:${date}`, { workingType: 'FIELD_WORK', routeIds: ['route-1'] });
  }
  async isDailyPlanApproved(userId: string, date: string) {
    return this.approved.has(`${userId}:${date}`);
  }
  days = new Map<string, { workingType: WorkingType; routeIds: string[] }>();
  async getDailyPlanDay(userId: string, date: string) {
    return this.days.get(`${userId}:${date}`) ?? null;
  }
}

export class FakeApprovals implements ApprovalsPort {
  requests = new Map<string, ApprovalRequest>();
  kinds = new Map<string, ApprovalKindDefinition>();
  registerKind(d: ApprovalKindDefinition) {
    this.kinds.set(d.kind, d);
  }
  async listForRecords(kind: string, recordIds: string[]) {
    return [...this.requests.values()].filter((r) => r.kind === kind && recordIds.includes(r.recordId));
  }
  async submit(input: { kind: string; recordId: string; submitterId: string; autoApprove?: boolean }) {
    const key = `${input.kind}:${input.recordId}`;
    const existing = this.requests.get(key);
    if (existing && !isEditableBySubmitter(existing.status)) throw AppError.conflict('Already waiting.');
    const request: ApprovalRequest = {
      id: existing?.id ?? `req-${this.requests.size + 1}`,
      kind: input.kind,
      recordId: input.recordId,
      submitterId: input.submitterId,
      status: input.autoApprove ? 'APPROVED' : 'SUBMITTED',
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
  setStatus(recordId: string, status: ApprovalStatus, kind = 'DCR') {
    const r = this.requests.get(`${kind}:${recordId}`)!;
    this.requests.set(`${kind}:${recordId}`, { ...r, status });
  }
}

export class FakeDcrs implements DcrRepositoryPort {
  rows: Dcr[] = [];
  /** Check and insert in one synchronous step, like the upsert on a unique index. */
  async getOrCreate(userId: string, reportDate: string) {
    const held = this.rows.find((d) => d.userId === userId && d.reportDate === reportDate);
    if (held) return held;
    const row = { id: `dcr-${this.rows.length + 1}`, userId, reportDate, createdAt: new Date() };
    this.rows.push(row);
    return row;
  }
  async findById(id: string) {
    return this.rows.find((d) => d.id === id) ?? null;
  }
  async findByUserAndDate(userId: string, date: string) {
    return this.rows.find((d) => d.userId === userId && d.reportDate === date) ?? null;
  }
  async listRange(from: string, to: string) {
    return this.rows.filter((d) => d.reportDate >= from && d.reportDate <= to).sort((a, b) => a.reportDate.localeCompare(b.reportDate));
  }
  async listForUsers(userIds: string[], from: string, to: string) {
    return this.rows.filter((d) => userIds.includes(d.userId) && d.reportDate >= from && d.reportDate <= to).sort((a, b) => b.reportDate.localeCompare(a.reportDate));
  }
}

export class FakeConfig implements ConfigReader {
  values: Record<string, string> = { BUSINESS_TIMEZONE: 'Asia/Kolkata', GEO_FENCE_RADIUS_METERS: '100', GEO_MAX_ACCURACY_METERS: '100', DCR_APPROVAL_REQUIRED: 'true', TA_MAX_KM: '99', EXPENSE_PAYOUT_DAY: '15', FY_START_MONTH: 'APRIL', FY_CLOSED_YEARS: 'NONE' };
  async get(key: string) {
    const v = this.values[key];
    if (v === undefined) throw new Error(`missing ${key}`);
    return v;
  }
}

/** A transaction with an undo log, so "the record fails whole" is provable without a database. */
export class Tx {
  undo: Array<() => void> = [];
  rollback() {
    for (const u of this.undo.reverse()) u();
    this.undo = [];
  }
}

export class FakeTerritory implements TerritoryPort {
  routesByUser = new Map<string, string[]>([['mr1', ['route-1']]]);
  async listRoutesForUser(userId: string) {
    return (this.routesByUser.get(userId) ?? []).map((id) => ({ id }));
  }
  routes = new Map<string, { id: string; routeType: 'HQ' | 'EX_STATION' | 'OUT_STATION'; distanceKm: string | null; distanceStatus: string; taPerKmRateOverridePaise: number | null }>([
    ['route-1', { id: 'route-1', routeType: 'EX_STATION', distanceKm: '10.67', distanceStatus: 'CALCULATED', taPerKmRateOverridePaise: null }],
  ]);
  async getRoute(id: string) {
    return this.routes.get(id) ?? null;
  }
}

const CLINIC = { latitude: 26.7271, longitude: 88.3953 };

/** Field Master Data as Field Activity sees it: who exists, who is assigned, where they are, and the samples left. */
export class FakeFmd implements FieldMasterDataPort {
  doctors = new Map<string, { id: string; name: string; status: 'active' | 'inactive'; routeId: string }>([['d1', { id: 'd1', name: 'Dr Rao', status: 'active', routeId: 'route-1' }]]);
  chemists = new Map<string, { id: string; name: string; status: 'active' | 'inactive'; routeId: string }>([['c1', { id: 'c1', name: 'Sai Pharmacy', status: 'active', routeId: 'route-1' }]]);
  products = new Map([['p1', { id: 'p1', name: 'Cough Syrup', sku: 'CS' }], ['p2', { id: 'p2', name: 'Vitamin', sku: 'VT' }]]);
  assigned = new Set(['mr1:d1']);
  doctorLocation: Record<string, { latitude: number; longitude: number } | null> = { d1: CLINIC };
  chemistLocation: Record<string, { latitude: number; longitude: number } | null> = { c1: CLINIC };
  allocations = new Map<string, { id: string; doctorId: string; productId: string; quantityAllocated: number; quantityRemaining: number }>([
    ['d1:p1', { id: 'a1', doctorId: 'd1', productId: 'p1', quantityAllocated: 10, quantityRemaining: 10 }],
    ['d1:p2', { id: 'a2', doctorId: 'd1', productId: 'p2', quantityAllocated: 3, quantityRemaining: 3 }],
  ]);
  async getDoctor(id: string) {
    return (this.doctors.get(id) as never) ?? null;
  }
  async getChemist(id: string) {
    return (this.chemists.get(id) as never) ?? null;
  }
  async getProduct(id: string) {
    return (this.products.get(id) as never) ?? null;
  }
  async getDoctorLocation(id: string) {
    return this.doctorLocation[id] ?? null;
  }
  async getChemistLocation(id: string) {
    return this.chemistLocation[id] ?? null;
  }
  assignedTo = new Map<string, string>([['d1', 'mr1']]);
  async getAssignedUserId(doctorId: string) {
    return this.assignedTo.get(doctorId) ?? null;
  }
  async listAssignedDoctors(userId: string) {
    return [...this.doctors.values()].filter((d) => this.assigned.has(`${userId}:${d.id}`)) as never;
  }
  async isAssignedToDoctor(userId: string, doctorId: string) {
    return this.assigned.has(`${userId}:${doctorId}`);
  }
  async getSampleAllocation(doctorId: string, productId: string) {
    const a = this.allocations.get(`${doctorId}:${productId}`);
    return a ? ({ ...a, allocatedBy: 'admin', allocatedAt: new Date() } as never) : null;
  }
  /** One synchronous check-and-take, like the conditional update, undone if the caller's transaction rolls back. */
  async decrementRemaining(allocationId: string, quantity: number, ctx?: unknown) {
    const a = [...this.allocations.values()].find((x) => x.id === allocationId);
    if (!a || a.quantityRemaining < quantity) return false;
    a.quantityRemaining -= quantity;
    (ctx as Tx | undefined)?.undo.push(() => {
      a.quantityRemaining += quantity;
    });
    return true;
  }
}

class FakeCalls<T extends { id: string; dcrId: string }> {
  rows: T[] = [];
  /** Ids are unique across the fakes, as ObjectIds are. */
  private static counter = 0;
  async create(input: Omit<T, 'id'>, ctx: unknown) {
    const row = { ...input, id: `rec-${++FakeCalls.counter}` } as T;
    this.rows.push(row);
    (ctx as Tx).undo.push(() => {
      this.rows.splice(this.rows.indexOf(row), 1);
    });
    return row;
  }
  async listForDcr(dcrId: string) {
    return this.rows.filter((r) => r.dcrId === dcrId);
  }
  async findById(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async countForDcrs(dcrIds: string[]) {
    const m = new Map<string, number>();
    for (const r of this.rows) if (dcrIds.includes(r.dcrId)) m.set(r.dcrId, (m.get(r.dcrId) ?? 0) + 1);
    return m;
  }
  async countByGeofence(range: { from: string; to: string }) {
    const by = new Map<string, { dcrId: string; status: 'PASS' | 'FAIL' | 'UNVERIFIED' | 'OVERRIDE'; count: number }>();
    for (const r of this.rows as unknown as Array<{ dcrId: string; reportDate: string; geofence: { status: 'PASS' | 'FAIL' | 'UNVERIFIED' | 'OVERRIDE' } }>) {
      if (r.reportDate < range.from || r.reportDate > range.to) continue;
      const key = `${r.dcrId}|${r.geofence.status}`;
      const cur = by.get(key) ?? { dcrId: r.dcrId, status: r.geofence.status, count: 0 };
      cur.count += 1;
      by.set(key, cur);
    }
    return [...by.values()];
  }
  async distinctDoctorIds(dcrIds: string[]) {
    return [...new Set((this.rows as unknown as Array<{ dcrId: string; doctorId: string }>).filter((r) => dcrIds.includes(r.dcrId)).map((r) => r.doctorId))];
  }
  async countByDcrRange(range: { from: string; to: string }) {
    const by = new Map<string, number>();
    for (const r of this.rows as unknown as Array<{ dcrId: string; reportDate: string }>) if (r.reportDate >= range.from && r.reportDate <= range.to) by.set(r.dcrId, (by.get(r.dcrId) ?? 0) + 1);
    return [...by].map(([dcrId, count]) => ({ dcrId, count }));
  }
  async overrideGeofence(id: string, o: { by: string; at: Date; comment: string }) {
    const row = this.rows.find((r) => r.id === id) as unknown as { geofence?: { status: string; overriddenBy: string | null; overriddenAt: Date | null; overrideComment: string | null } } | undefined;
    if (!row?.geofence || !['FAIL', 'UNVERIFIED'].includes(row.geofence.status)) return false;
    Object.assign(row.geofence, { status: 'OVERRIDE', overriddenBy: o.by, overriddenAt: o.at, overrideComment: o.comment });
    return true;
  }
}
export class FakeDoctorCalls extends FakeCalls<DoctorCall> implements DoctorCallRepositoryPort {}
export class FakeChemistCalls extends FakeCalls<ChemistCall> implements ChemistCallRepositoryPort {}
export class FakeFollowups extends FakeCalls<Followup> implements FollowupRepositoryPort {}
export class FakeExpenses extends FakeCalls<Expense> implements ExpenseRepositoryPort {
  async summarizeByMonth(range: { from: string; to: string }) {
    const by = new Map<string, ExpenseMonthSummary>();
    for (const r of this.rows.filter((x) => x.accepted && x.paymentStatus !== 'CANCELLED' && x.reportDate >= range.from && x.reportDate <= range.to)) {
      const key = `${r.userId}|${r.reportDate.slice(0, 7)}`;
      const s = by.get(key) ?? { userId: r.userId, month: r.reportDate.slice(0, 7), taPaise: 0, daPaise: 0, reimbursementPaise: 0, paidPaise: 0, unpaidPaise: 0, flaggedRows: 0 };
      if (r.type === 'TA') s.taPaise += r.amountPaise;
      else if (r.type === 'DA') s.daPaise += r.amountPaise;
      else s.reimbursementPaise += r.amountPaise;
      if (r.paymentStatus === 'PAID') s.paidPaise += r.amountPaise;
      else s.unpaidPaise += r.amountPaise;
      if (r.distanceFlag) s.flaggedRows += 1;
      by.set(key, s);
    }
    return [...by.values()];
  }
  async setAccepted(dcrId: string, accepted: boolean, ctx: unknown) {
    for (const r of this.rows.filter((x) => x.dcrId === dcrId && x.paymentStatus !== 'PAID')) {
      const before = r.accepted;
      r.accepted = accepted;
      (ctx as Tx).undo.push(() => {
        r.accepted = before;
      });
    }
  }
  async markPaid(id: string, by: string, at: Date) {
    const r = this.rows.find((x) => x.id === id);
    if (!r || !r.accepted || r.paymentStatus !== 'UNPAID') return false;
    Object.assign(r, { paymentStatus: 'PAID', paidBy: by, paidAt: at });
    return true;
  }
  async listAccepted(f: { from: string; to: string; userId?: string; paymentStatus?: 'UNPAID' | 'PAID' }, limit: number) {
    const hit = this.rows.filter((r) => r.accepted && r.reportDate >= f.from && r.reportDate <= f.to && (!f.userId || r.userId === f.userId) && (r.paymentStatus === 'UNPAID' || r.paymentStatus === 'PAID') && (!f.paymentStatus || r.paymentStatus === f.paymentStatus));
    return [...hit.filter((r) => r.paymentStatus === 'UNPAID'), ...hit.filter((r) => r.paymentStatus === 'PAID')].slice(0, limit);
  }
  async statementsForRange(range: { from: string; to: string }) {
    const out = new Map<string, ExpenseStatement>();
    const empty = (): ExpenseBucket => ({ taPaise: 0, daPaise: 0, reimbursementPaise: 0, count: 0 });
    for (const r of this.rows.filter((x) => x.accepted && (x.paymentStatus === 'UNPAID' || x.paymentStatus === 'PAID') && x.reportDate >= range.from && x.reportDate <= range.to)) {
      const s = out.get(r.userId) ?? { userId: r.userId, unpaid: empty(), paid: empty(), lastPaidAt: null };
      const b = r.paymentStatus === 'PAID' ? s.paid : s.unpaid;
      if (r.type === 'TA') b.taPaise += r.amountPaise;
      else if (r.type === 'DA') b.daPaise += r.amountPaise;
      else b.reimbursementPaise += r.amountPaise;
      b.count += 1;
      if (r.paidAt && (!s.lastPaidAt || r.paidAt > s.lastPaidAt)) s.lastPaidAt = r.paidAt;
      out.set(r.userId, s);
    }
    return [...out.values()];
  }
  async payAllForUser(userId: string, range: { from: string; to: string }, by: string, at: Date) {
    const hit = this.rows.filter((r) => r.userId === userId && r.accepted && r.paymentStatus === 'UNPAID' && r.reportDate >= range.from && r.reportDate <= range.to);
    for (const r of hit) Object.assign(r, { paymentStatus: 'PAID', paidBy: by, paidAt: at });
    return hit.length;
  }
  async paidTotals(userId: string, period: { from: Date; to: Date }) {
    const paid = this.rows.filter((r) => r.userId === userId && r.paymentStatus === 'PAID' && r.paidAt !== null && r.paidAt >= period.from && r.paidAt < period.to);
    const sum = (...t: string[]) => paid.filter((r) => t.includes(r.type)).reduce((a, r) => a + r.amountPaise, 0);
    return { taPaise: sum('TA'), daPaise: sum('DA'), reimbursementPaise: sum('TRAVEL', 'MEAL', 'MISC') };
  }
  async totalsForDcrs(dcrIds: string[]) {
    const out = new Map<string, { taPaise: number; daPaise: number; otherPaise: number; paidPaise: number }>();
    for (const r of this.rows.filter((x) => dcrIds.includes(x.dcrId) && x.paymentStatus !== 'CANCELLED')) {
      const t = out.get(r.dcrId) ?? { taPaise: 0, daPaise: 0, otherPaise: 0, paidPaise: 0 };
      if (r.type === 'TA') t.taPaise += r.amountPaise;
      else if (r.type === 'DA') t.daPaise += r.amountPaise;
      else t.otherPaise += r.amountPaise;
      if (r.paymentStatus === 'PAID') t.paidPaise += r.amountPaise;
      out.set(r.dcrId, t);
    }
    return out;
  }
  async hasActiveAuto(dcrId: string) {
    return this.rows.some((r) => r.dcrId === dcrId && r.source === 'AUTO' && r.paymentStatus !== 'CANCELLED');
  }
  async cancelUnpaidAuto(dcrId: string, ctx: unknown) {
    const hit = this.rows.filter((r) => r.dcrId === dcrId && r.source === 'AUTO' && r.paymentStatus === 'UNPAID');
    for (const r of hit) {
      r.paymentStatus = 'CANCELLED';
      (ctx as Tx).undo.push(() => {
        r.paymentStatus = 'UNPAID';
      });
    }
    return hit.length;
  }
}

export class FakeServices implements DoctorServiceRepositoryPort {
  rows: DoctorService[] = [];
  async create(input: Omit<DoctorService, 'id'>, ctx?: unknown) {
    const row = { ...input, id: `svc-${this.rows.length + 1}` };
    this.rows.push(row);
    (ctx as Tx | undefined)?.undo.push(() => {
      this.rows.splice(this.rows.indexOf(row), 1);
    });
    return row;
  }
  async findById(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async list(filter: { userId?: string; doctorId?: string }, limit: number) {
    return this.rows.filter((r) => (!filter.userId || r.userId === filter.userId) && (!filter.doctorId || r.doctorId === filter.doctorId)).slice(0, limit);
  }
}
export class FakeGifts implements DoctorGiftRepositoryPort {
  rows: DoctorGift[] = [];
  async create(input: Omit<DoctorGift, 'id'>) {
    const row = { ...input, id: `gift-${this.rows.length + 1}` };
    this.rows.push(row);
    return row;
  }
  async findById(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async list(filter: { doctorIds?: string[]; status?: DoctorGift['status'] }, limit: number) {
    return this.rows.filter((r) => (!filter.doctorIds || filter.doctorIds.includes(r.doctorId)) && (!filter.status || r.status === filter.status)).slice(0, limit);
  }
  async markDone(id: string, by: string, at: Date, ctx: unknown) {
    const g = this.rows.find((r) => r.id === id);
    if (!g || g.status !== 'PENDING') return false;
    Object.assign(g, { status: 'DONE', completedBy: by, completedAt: at });
    (ctx as Tx).undo.push(() => Object.assign(g, { status: 'PENDING', completedBy: null, completedAt: null }));
    return true;
  }
}

export class FakeLeave implements LeavePort {
  leaveDays = new Set<string>();
  offDays = new Set<string>();
  async isOnLeave(userId: string, date: string) {
    return this.leaveDays.has(`${userId}:${date}`);
  }
  async listOffDates(_userId: string, from: string, to: string) {
    return [...this.offDays].filter((d) => d >= from && d <= to);
  }
}

/** 2026-10-05 12:00 IST — a working day well inside the business day. */
export function faKit(nowIso = '2026-10-05T06:30:00Z') {
  const users = new FakeUsers();
  const planning = new FakePlanning();
  const approvals = new FakeApprovals();
  const dcrs = new FakeDcrs();
  const config = new FakeConfig();
  const clock = { current: new Date(nowIso) };
  const dcrClock = new DcrClock(config, () => clock.current);
  const gate = new LoggingGate(users, planning, approvals, dcrs, dcrClock);
  const views = new DcrViews(approvals);
  const fmd = new FakeFmd();
  const territory = new FakeTerritory();
  const doctorCalls = new FakeDoctorCalls();
  const chemistCalls = new FakeChemistCalls();
  const followups = new FakeFollowups();
  const expenses = new FakeExpenses();
  const checks = new CallChecks(fmd, territory, users, planning);
  const geofence = new GeofenceEvaluator(config);
  const logDoctorCall = new LogDoctorCallUseCase(gate, checks, geofence, fmd, doctorCalls);
  const logChemistCall = new LogChemistCallUseCase(gate, checks, geofence, fmd, chemistCalls);
  const logFollowup = new LogFollowupUseCase(gate, checks, followups);
  const logExpense = new LogExpenseUseCase(gate, expenses);
  const taDa = new TaDaLifecycle(dcrs, planning, territory, users, expenses, config);
  const submit = new SubmitDcrUseCase(gate, dcrs, approvals, taDa, config);
  const listExpenses = new ListExpensesUseCase(expenses, users);
  const markPaid = new MarkExpensePaidUseCase(expenses, config, () => new Date(clock.current));
  const paidTaDa = new GetPaidTaDaTotalUseCase(expenses, dcrClock);
  const dcrSummary = new GetDcrSummaryUseCase(dcrs, views, doctorCalls, chemistCalls, followups, expenses);
  const leave = new FakeLeave();
  const hasQualifying = new HasQualifyingDcrUseCase(dcrs, approvals);
  const missedCheck = new RunMissedDcrCheckUseCase(users, leave, (u, d) => hasQualifying.execute(u, d), dcrClock, config);
  const services = new FakeServices();
  const gifts = new FakeGifts();
  const submitService = new SubmitDoctorServiceUseCase(users, checks, services, approvals);
  const adminService = new CreateAdminDoctorServiceUseCase(fmd, services, () => new Date(clock.current));
  const allocateGift = new AllocateGiftUseCase(fmd, gifts, () => new Date(clock.current));
  const markGiftDone = new MarkGiftDoneUseCase(users, checks, gifts);
  return { users, planning, approvals, dcrs, config, clock, gate, submit, views, fmd, territory, doctorCalls, chemistCalls, followups, expenses, logDoctorCall, logChemistCall, logFollowup, logExpense, taDa, leave, missedCheck, listExpenses, markPaid, paidTaDa, dcrSummary, services, gifts, submitService, adminService, allocateGift, markGiftDone };
}

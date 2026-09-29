import type { ApprovalKindDefinition, ApprovalRequest, ApprovalStatus } from '@/modules/approval/approval.public.js';
import { isEditableBySubmitter } from '@/modules/approval/approval.public.js';
import { AppError } from '@/shared/errors/AppError.js';
import type { ConfigReader } from '@/shared/config/readConfig.js';
import type { ApprovalsPort } from '../../domain/approvals.port.js';
import type { Dcr } from '../../domain/dcr.entity.js';
import type { DcrRepositoryPort } from '../../domain/dcr.repository.port.js';
import type { PlanningPort } from '../../domain/planning.port.js';
import type { ChemistCall, DoctorCall, Followup } from '../../domain/call.entity.js';
import type { Expense } from '../../domain/expense.entity.js';
import type { FieldMasterDataPort } from '../../domain/fieldMasterData.port.js';
import type { ChemistCallRepositoryPort, DoctorCallRepositoryPort, ExpenseRepositoryPort, FollowupRepositoryPort } from '../../domain/records.repository.port.js';
import type { TerritoryPort } from '../../domain/territory.port.js';
import type { DirectoryUser, UserDirectoryPort } from '../../domain/userDirectory.port.js';
import { CallChecks } from '../callChecks.js';
import { GeofenceEvaluator } from '../geofenceEvaluator.js';
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
}

export class FakePlanning implements PlanningPort {
  approved = new Set<string>();
  approve(userId: string, date: string) {
    this.approved.add(`${userId}:${date}`);
  }
  async isDailyPlanApproved(userId: string, date: string) {
    return this.approved.has(`${userId}:${date}`);
  }
}

export class FakeApprovals implements ApprovalsPort {
  requests = new Map<string, ApprovalRequest>();
  kinds = new Map<string, ApprovalKindDefinition>();
  registerKind(d: ApprovalKindDefinition) {
    this.kinds.set(d.kind, d);
  }
  async submit(input: { kind: string; recordId: string; submitterId: string }) {
    const key = `${input.kind}:${input.recordId}`;
    const existing = this.requests.get(key);
    if (existing && !isEditableBySubmitter(existing.status)) throw AppError.conflict('Already waiting.');
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
  async listForUsers(userIds: string[], from: string, to: string) {
    return this.rows.filter((d) => userIds.includes(d.userId) && d.reportDate >= from && d.reportDate <= to).sort((a, b) => b.reportDate.localeCompare(a.reportDate));
  }
}

export class FakeConfig implements ConfigReader {
  values: Record<string, string> = { BUSINESS_TIMEZONE: 'Asia/Kolkata', GEO_FENCE_RADIUS_METERS: '100', GEO_MAX_ACCURACY_METERS: '100' };
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
export class FakeExpenses extends FakeCalls<Expense> implements ExpenseRepositoryPort {}

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
  const submit = new SubmitDcrUseCase(gate, dcrs, approvals);
  const views = new DcrViews(approvals);
  const fmd = new FakeFmd();
  const territory = new FakeTerritory();
  const doctorCalls = new FakeDoctorCalls();
  const chemistCalls = new FakeChemistCalls();
  const followups = new FakeFollowups();
  const expenses = new FakeExpenses();
  const checks = new CallChecks(fmd, territory, users);
  const geofence = new GeofenceEvaluator(config);
  const logDoctorCall = new LogDoctorCallUseCase(gate, checks, geofence, fmd, doctorCalls);
  const logChemistCall = new LogChemistCallUseCase(gate, checks, geofence, fmd, chemistCalls);
  const logFollowup = new LogFollowupUseCase(gate, checks, followups);
  const logExpense = new LogExpenseUseCase(gate, expenses);
  return { users, planning, approvals, dcrs, config, clock, gate, submit, views, fmd, territory, doctorCalls, chemistCalls, followups, expenses, logDoctorCall, logChemistCall, logFollowup, logExpense };
}

import type { ApprovalKindDefinition, ApprovalRequest, ApprovalStatus } from '@/modules/approval/approval.public.js';
import { isEditableBySubmitter } from '@/modules/approval/approval.public.js';
import { AppError } from '@/shared/errors/AppError.js';
import type { ConfigReader } from '@/shared/config/readConfig.js';
import type { ApprovalsPort } from '../../domain/approvals.port.js';
import type { Dcr } from '../../domain/dcr.entity.js';
import type { DcrRepositoryPort } from '../../domain/dcr.repository.port.js';
import type { PlanningPort } from '../../domain/planning.port.js';
import type { DirectoryUser, UserDirectoryPort } from '../../domain/userDirectory.port.js';
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
  values: Record<string, string> = { BUSINESS_TIMEZONE: 'Asia/Kolkata' };
  async get(key: string) {
    const v = this.values[key];
    if (v === undefined) throw new Error(`missing ${key}`);
    return v;
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
  const submit = new SubmitDcrUseCase(gate, dcrs, approvals);
  const views = new DcrViews(approvals);
  return { users, planning, approvals, dcrs, config, clock, gate, submit, views };
}

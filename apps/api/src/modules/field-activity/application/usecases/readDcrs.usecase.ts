import type { RoleName } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import type { DcrRepositoryPort } from '../../domain/dcr.repository.port.js';
import type { ChemistCallRepositoryPort, DoctorCallRepositoryPort, FollowupRepositoryPort } from '../../domain/records.repository.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { DcrView, DcrViews } from '../dcrViews.js';

export interface Actor {
  id: string;
  role: RoleName;
}

/** A DCR is readable by its owner, anyone above them in the chain (read-only), and Admin. */
async function assertCanRead(users: UserDirectoryPort, actor: Actor, ownerId: string): Promise<void> {
  if (actor.id === ownerId || actor.role === 'ADMIN') return;
  const chain = await users.getManagerChain(ownerId);
  if (!chain.some((m) => m.id === actor.id)) throw AppError.forbidden();
}

/** What the phone's DCR report shows for a day (2026-11-28): the calls and follow-ups on it, counted in three batched reads. */
export type DcrWithCounts = DcrView & { doctorCalls: number; chemistCalls: number; followups: number };

/** The caller's own DCRs in a date range, newest first, each with its call and follow-up counts when the record stores are given. */
export class ListMyDcrsUseCase {
  constructor(
    private readonly dcrs: DcrRepositoryPort,
    private readonly views: DcrViews,
    private readonly records?: { doctorCalls: DoctorCallRepositoryPort; chemistCalls: ChemistCallRepositoryPort; followups: FollowupRepositoryPort },
  ) {}

  async execute(userId: string, from: string, to: string): Promise<Array<DcrView | DcrWithCounts>> {
    const views = await this.views.many(await this.dcrs.listForUsers([userId], from, to));
    if (!this.records || views.length === 0) return views;
    const ids = views.map((v) => v.id);
    const [doctor, chemist, followups] = await Promise.all([this.records.doctorCalls.countForDcrs(ids), this.records.chemistCalls.countForDcrs(ids), this.records.followups.countForDcrs(ids)]);
    return views.map((v) => ({ ...v, doctorCalls: doctor.get(v.id) ?? 0, chemistCalls: chemist.get(v.id) ?? 0, followups: followups.get(v.id) ?? 0 }));
  }
}

/** A manager's team view: their downline's DCRs in a range, read-only, optionally narrowed to one person. */
export class ListTeamDcrsUseCase {
  constructor(
    private readonly dcrs: DcrRepositoryPort,
    private readonly users: UserDirectoryPort,
    private readonly views: DcrViews,
  ) {}

  async execute(actor: Actor, from: string, to: string, userId: string | null): Promise<DcrView[]> {
    const downline = (await this.users.getDownline(actor.id)).map((u) => u.id);
    if (userId !== null && !downline.includes(userId)) throw AppError.forbidden('That employee is not in your team.');
    return this.views.many(await this.dcrs.listForUsers(userId ? [userId] : downline, from, to));
  }
}

/** Admin's org-wide read: anyone's DCRs, or everyone's if no one is named. */
export class ListAllDcrsUseCase {
  constructor(
    private readonly dcrs: DcrRepositoryPort,
    private readonly users: UserDirectoryPort,
    private readonly views: DcrViews,
  ) {}

  async execute(from: string, to: string, userId: string): Promise<DcrView[]> {
    if (!(await this.users.findUserSummary(userId))) throw AppError.notFound('No such employee.');
    return this.views.many(await this.dcrs.listForUsers([userId], from, to));
  }
}

/** One DCR — the owner, their managers, Admin. */
export class GetDcrUseCase {
  constructor(
    private readonly dcrs: DcrRepositoryPort,
    private readonly users: UserDirectoryPort,
    private readonly views: DcrViews,
  ) {}

  async execute(actor: Actor, id: string): Promise<DcrView> {
    const dcr = await this.dcrs.findById(id);
    if (!dcr) throw AppError.notFound('No such report.');
    await assertCanRead(this.users, actor, dcr.userId);
    return this.views.one(dcr);
  }
}

import { AppError } from '@/shared/errors/AppError.js';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { Paise } from '@/shared/money/paise.js';
import type { ApprovalsPort } from '../../domain/approvals.port.js';
import type { FieldMasterDataPort } from '../../domain/fieldMasterData.port.js';
import { GATE_CODES, GateRefusal } from '../../domain/gateRefusal.js';
import { LOG_CODES, LogRefusal } from '../../domain/logRefusal.js';
import type { DoctorGiftRepositoryPort, DoctorServiceRepositoryPort } from '../../domain/records.repository.port.js';
import type { DoctorGift, DoctorService, DoctorServiceType } from '../../domain/serviceGift.entity.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { CallChecks } from '../callChecks.js';
import type { RecordContext } from './logCalls.usecase.js';
import type { Actor } from './readDcrs.usecase.js';

/** The approval kind for an MR-submitted Doctor Service; `recordId` is the Service's id. */
export const DOCTOR_SERVICE_KIND = 'DOCTOR_SERVICE';

/** A blocked employee (HLD 10) can submit nothing new — the same rule the daily gate applies, minus the day. */
async function assertNotBlocked(users: UserDirectoryPort, userId: string): Promise<void> {
  if (await users.isBlocked(userId)) throw new GateRefusal(GATE_CODES.userBlocked, 'You are blocked for missed reports. Your manager or Admin has to unblock you first.');
}

interface ServiceInput {
  doctorId: string;
  serviceType: DoctorServiceType;
  amountPaise: Paise;
  remarks: string | null;
}

/**
 * An MR asks for a service for one of their Doctors (LLD field-activity.md, *Doctor Service and Gift*): it is
 * stored and submitted as a `DOCTOR_SERVICE` approval request (Employee → Manager → Admin) in the sync engine's
 * transaction. Not part of the day's DCR, so no Plan or day gate — but not for a blocked MR, and only for a Doctor
 * the MR is still assigned to, checked as it is now.
 */
export class SubmitDoctorServiceUseCase {
  constructor(
    private readonly users: UserDirectoryPort,
    private readonly checks: CallChecks,
    private readonly services: DoctorServiceRepositoryPort,
    private readonly approvals: ApprovalsPort,
  ) {}

  async execute(rec: RecordContext, input: ServiceInput, ctx: TransactionContext): Promise<{ serverId: string }> {
    await assertNotBlocked(this.users, rec.userId);
    await this.checks.serviceDoctor(rec.userId, input.doctorId);
    const service = await this.services.create({ ...input, userId: rec.userId, createdBy: rec.userId, origin: 'MR', clientId: rec.clientId, createdAt: rec.recordedAt, doneBy: null, doneAt: null }, ctx);
    await this.approvals.submit({ kind: DOCTOR_SERVICE_KIND, recordId: service.id, submitterId: rec.userId }, ctx);
    return { serverId: service.id };
  }
}

/** Admin creates a Service directly: effective at once, no approval, tied to the Doctor's assigned MR. */
export class CreateAdminDoctorServiceUseCase {
  constructor(
    private readonly master: FieldMasterDataPort,
    private readonly services: DoctorServiceRepositoryPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(adminId: string, input: ServiceInput): Promise<DoctorService> {
    if (!(await this.master.getDoctor(input.doctorId))) throw AppError.notFound('No such doctor.');
    const userId = await this.master.getAssignedUserId(input.doctorId);
    if (!userId) throw AppError.conflict('This doctor has no assigned MR, so the service has nobody to be tied to. Assign the doctor first.');
    return this.services.create({ ...input, userId, createdBy: adminId, origin: 'ADMIN', clientId: null, createdAt: this.now(), doneBy: null, doneAt: null });
  }
}

export interface DoctorServiceView extends DoctorService {
  doctorName: string;
  /** Who the service is tied to (the requester), named — for a manager reading the team's list. */
  userName?: string;
  /** `APPROVED` for an Admin-made one; otherwise its request's status. */
  status: string;
  approval: { requestId: string; cycle: number } | null;
  /** Approved and not yet marked done: waiting for Admin or Accounts. */
  awaitingDone: boolean;
}

async function toServiceView(approvals: ApprovalsPort, master: FieldMasterDataPort, s: DoctorService): Promise<DoctorServiceView> {
  const request = s.origin === 'ADMIN' ? null : await approvals.getForRecord(DOCTOR_SERVICE_KIND, s.id);
  const status = s.origin === 'ADMIN' ? 'APPROVED' : (request?.status ?? 'DRAFT');
  return {
    ...s,
    doctorName: (await master.getDoctor(s.doctorId))?.name ?? '',
    status,
    approval: request && { requestId: request.id, cycle: request.cycle },
    awaitingDone: status === 'APPROVED' && !s.doneAt,
  };
}

/**
 * An MR's own Services; Admin's, optionally narrowed to one MR or Doctor. Newest first. A field manager asking for `scope: 'team'` gets their
 * own and everyone below them (any depth), each named, computed when asked (2026-11-18); without it, only their own, as before.
 */
export class ListDoctorServicesUseCase {
  constructor(
    private readonly services: DoctorServiceRepositoryPort,
    private readonly approvals: ApprovalsPort,
    private readonly master: FieldMasterDataPort,
    private readonly users?: UserDirectoryPort,
  ) {}

  async execute(actor: Actor, filter: { userId?: string | undefined; doctorId?: string | undefined; scope?: 'mine' | 'team' | undefined }, limit = 200): Promise<DoctorServiceView[]> {
    const admin = actor.role === 'ADMIN' || actor.role === 'ACCOUNTANT';
    const doctor = filter.doctorId ? { doctorId: filter.doctorId } : {};
    let team: string[] | null = null;
    if (!admin && filter.scope === 'team' && this.users) {
      const below = await this.users.getDownline(actor.id);
      if (below.length > 0) team = [actor.id, ...below.map((u) => u.id)];
    }
    const scope = admin ? { ...(filter.userId && { userId: filter.userId }), ...doctor } : team ? { userIds: team, ...doctor } : { userId: actor.id, ...doctor };
    const rows = await this.services.list(scope, limit);
    const views = await Promise.all(rows.map((s) => toServiceView(this.approvals, this.master, s)));
    if (!team || !this.users) return views;
    const names = new Map((await this.users.getUserSummaries([...new Set(rows.map((r) => r.userId))])).map((u) => [u.id, u.name]));
    return views.map((v) => ({ ...v, userName: names.get(v.userId) ?? '' }));
  }
}

/**
 * One Service by its own id — what an approval request points at (`recordId`). Admin sees any; an MR only their own,
 * and anyone else gets the same 404 as an id that does not exist, so it does not reveal one.
 */
export class GetDoctorServiceUseCase {
  constructor(
    private readonly services: DoctorServiceRepositoryPort,
    private readonly approvals: ApprovalsPort,
    private readonly master: FieldMasterDataPort,
    private readonly users?: UserDirectoryPort,
  ) {}

  async execute(actor: Actor, id: string): Promise<DoctorServiceView> {
    const service = await this.services.findById(id);
    const privileged = actor.role === 'ADMIN' || actor.role === 'ACCOUNTANT';
    // A manager above the MR the service is tied to reads it too (it is in their Approvals, and on their Services page).
    const above = !privileged && !!service && service.userId !== actor.id && !!this.users && (await this.users.getManagerChain(service.userId)).some((m) => m.id === actor.id);
    if (!service || (!privileged && service.userId !== actor.id && !above)) throw AppError.notFound('No such doctor service.');
    const view = await toServiceView(this.approvals, this.master, service);
    if (!this.users || service.userId === actor.id) return view;
    return { ...view, userName: (await this.users.findUserSummary(service.userId))?.name ?? '' };
  }
}

/**
 * Admin or Accounts marks an approved Service done — the last step. Refused while the Service is still waiting for its
 * approval (or was rejected), and when it is already done; the update is conditional so two people cannot both do it.
 */
export class MarkDoctorServiceDoneUseCase {
  constructor(
    private readonly services: DoctorServiceRepositoryPort,
    private readonly approvals: ApprovalsPort,
    private readonly master: FieldMasterDataPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(actorId: string, id: string): Promise<DoctorServiceView> {
    const service = await this.services.findById(id);
    if (!service) throw AppError.notFound('No such doctor service.');
    const view = await toServiceView(this.approvals, this.master, service);
    if (view.status !== 'APPROVED') throw AppError.conflict('This service is not approved yet, so it cannot be marked done.');
    if (service.doneAt) throw AppError.conflict('This service is already marked done.');
    if (!(await this.services.markDone(id, actorId, this.now()))) throw AppError.conflict('This service is already marked done.');
    return toServiceView(this.approvals, this.master, (await this.services.findById(id)) ?? service);
  }
}

/** Admin allocates a gift to a Doctor. No approval, and it needs no MR yet — whoever is assigned when it's done does it. */
export class AllocateGiftUseCase {
  constructor(
    private readonly master: FieldMasterDataPort,
    private readonly gifts: DoctorGiftRepositoryPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(adminId: string, input: { doctorId: string; productName: string; amountPaise: Paise }): Promise<DoctorGift> {
    const doctor = await this.master.getDoctor(input.doctorId);
    if (!doctor) throw AppError.notFound('No such doctor.');
    // An inactive or deleted doctor (answered from the archive) keeps its history but takes no new gift.
    if (doctor.status !== 'active') throw AppError.conflict('This doctor is inactive, so it can’t be given a gift.');
    return this.gifts.create({ ...input, allocatedBy: adminId, status: 'PENDING', completedBy: null, completedAt: null, allocatedAt: this.now() });
  }
}

/**
 * The assigned MR marks a gift `DONE` (sync kind `GIFT_DONE`). Refused if the gift doesn't exist, the MR isn't
 * assigned to that Doctor now, or it was already done — by them or by the MR the Doctor had before. One
 * conditional update, so two phones can't both complete it.
 */
export class MarkGiftDoneUseCase {
  constructor(
    private readonly users: UserDirectoryPort,
    private readonly checks: CallChecks,
    private readonly gifts: DoctorGiftRepositoryPort,
  ) {}

  async execute(rec: RecordContext, giftId: string, ctx: TransactionContext): Promise<{ serverId: string }> {
    await assertNotBlocked(this.users, rec.userId);
    const gift = await this.gifts.findById(giftId);
    if (!gift) throw new LogRefusal(LOG_CODES.giftNotFound, 'This gift isn’t on the list any more.');
    await this.checks.doctor(rec.userId, gift.doctorId);
    if (!(await this.gifts.markDone(gift.id, rec.userId, rec.recordedAt, ctx))) throw new LogRefusal(LOG_CODES.giftAlreadyDone, 'This gift was already marked as given.');
    return { serverId: gift.id };
  }
}

/**
 * An MR's pending and done gifts for the Doctors they have; Admin's, every gift (optionally by status). A field manager asking for
 * `scope: 'team'` also gets the gifts of doctors held by anyone below them, each with the MR's `userId` and name (2026-11-18).
 */
export class ListGiftsUseCase {
  constructor(
    private readonly gifts: DoctorGiftRepositoryPort,
    private readonly master: FieldMasterDataPort,
    private readonly users?: UserDirectoryPort,
  ) {}

  async execute(
    actor: Actor,
    filter: { status?: DoctorGift['status'] | undefined; scope?: 'mine' | 'team' | undefined },
    limit = 200,
  ): Promise<Array<DoctorGift & { doctorName: string; userId?: string; userName?: string }>> {
    const status = filter.status ? { status: filter.status } : {};
    if (actor.role === 'ADMIN') return this.named(await this.gifts.list(status, limit));
    const holders = new Map<string, string>(); // doctor id -> the MR who holds it
    let people = [actor.id];
    if (filter.scope === 'team' && this.users) people = [actor.id, ...(await this.users.getDownline(actor.id)).map((u) => u.id)];
    for (const userId of people) for (const d of await this.master.listAssignedDoctors(userId)) if (!holders.has(d.id)) holders.set(d.id, userId);
    const rows = await this.gifts.list({ ...status, doctorIds: [...holders.keys()] }, limit);
    if (filter.scope !== 'team' || !this.users) return this.named(rows);
    const names = new Map((await this.users.getUserSummaries([...new Set(holders.values())])).map((u) => [u.id, u.name]));
    return (await this.named(rows)).map((g) => ({ ...g, userId: holders.get(g.doctorId) ?? '', userName: names.get(holders.get(g.doctorId) ?? '') ?? '' }));
  }

  private named(rows: DoctorGift[]) {
    return Promise.all(rows.map(async (g) => ({ ...g, doctorName: (await this.master.getDoctor(g.doctorId))?.name ?? '' })));
  }
}

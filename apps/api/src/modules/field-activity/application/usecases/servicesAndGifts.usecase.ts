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
    await this.checks.doctor(rec.userId, input.doctorId);
    const service = await this.services.create({ ...input, userId: rec.userId, createdBy: rec.userId, origin: 'MR', clientId: rec.clientId, createdAt: rec.recordedAt }, ctx);
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
    return this.services.create({ ...input, userId, createdBy: adminId, origin: 'ADMIN', clientId: null, createdAt: this.now() });
  }
}

export interface DoctorServiceView extends DoctorService {
  doctorName: string;
  /** `APPROVED` for an Admin-made one; otherwise its request's status. */
  status: string;
  approval: { requestId: string; cycle: number } | null;
}

async function toServiceView(approvals: ApprovalsPort, master: FieldMasterDataPort, s: DoctorService): Promise<DoctorServiceView> {
  const request = s.origin === 'ADMIN' ? null : await approvals.getForRecord(DOCTOR_SERVICE_KIND, s.id);
  return {
    ...s,
    doctorName: (await master.getDoctor(s.doctorId))?.name ?? '',
    status: s.origin === 'ADMIN' ? 'APPROVED' : (request?.status ?? 'DRAFT'),
    approval: request && { requestId: request.id, cycle: request.cycle },
  };
}

/** An MR's own Services; Admin's, optionally narrowed to one MR or Doctor. Newest first. */
export class ListDoctorServicesUseCase {
  constructor(
    private readonly services: DoctorServiceRepositoryPort,
    private readonly approvals: ApprovalsPort,
    private readonly master: FieldMasterDataPort,
  ) {}

  async execute(actor: Actor, filter: { userId?: string | undefined; doctorId?: string | undefined }, limit = 200): Promise<DoctorServiceView[]> {
    const scope = actor.role === 'ADMIN' ? { ...(filter.userId && { userId: filter.userId }), ...(filter.doctorId && { doctorId: filter.doctorId }) } : { userId: actor.id, ...(filter.doctorId && { doctorId: filter.doctorId }) };
    const rows = await this.services.list(scope, limit);
    return Promise.all(rows.map((s) => toServiceView(this.approvals, this.master, s)));
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
  ) {}

  async execute(actor: Actor, id: string): Promise<DoctorServiceView> {
    const service = await this.services.findById(id);
    if (!service || (actor.role !== 'ADMIN' && service.userId !== actor.id)) throw AppError.notFound('No such doctor service.');
    return toServiceView(this.approvals, this.master, service);
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
    if (!(await this.master.getDoctor(input.doctorId))) throw AppError.notFound('No such doctor.');
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

/** An MR's pending and done gifts for the Doctors they have; Admin's, every gift (optionally by status). */
export class ListGiftsUseCase {
  constructor(
    private readonly gifts: DoctorGiftRepositoryPort,
    private readonly master: FieldMasterDataPort,
  ) {}

  async execute(actor: Actor, filter: { status?: DoctorGift['status'] | undefined }, limit = 200): Promise<Array<DoctorGift & { doctorName: string }>> {
    const status = filter.status ? { status: filter.status } : {};
    const rows = await this.gifts.list(actor.role === 'ADMIN' ? status : { ...status, doctorIds: (await this.master.listAssignedDoctors(actor.id)).map((d) => d.id) }, limit);
    return Promise.all(rows.map(async (g) => ({ ...g, doctorName: (await this.master.getDoctor(g.doctorId))?.name ?? '' })));
  }
}

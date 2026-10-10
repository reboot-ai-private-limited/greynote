import { isEditableBySubmitter } from '@/modules/approval/approval.public.js';
import type { TransactionContext, TransactionRunnerPort } from '@/shared/db/transaction.port.js';
import { AppError } from '@/shared/errors/AppError.js';
import { buildPaginatedResult, type PaginatedResult } from '@/shared/http/pagination.js';
import type { ApprovalsPort } from '../../domain/approvals.port.js';
import type { Doctor } from '../../domain/doctor.entity.js';
import type { DoctorRepositoryPort } from '../../domain/doctor.repository.port.js';
import { DuplicateRecordError } from '../../domain/duplicateRecord.error.js';
import type { GeoPoint, PageQuery } from '../../domain/masterStatus.js';
import type { TerritoryPort } from '../../domain/territory.port.js';
import type { SpecialtyCatalog } from '../specialtyCatalog.js';
import { NEW_DOCTOR_KIND } from '../doctorApproval.js';
import type { DoctorView, DoctorViews } from '../doctorViews.js';

/** What an MR fills when adding a Doctor (sign-off C4): no status, no assignment — those come from the approval. */
export interface AddedDoctorInput {
  routeId: string;
  name: string;
  address: string;
  email: string | null;
  specialty: string;
  qualification: string;
  dateOfBirth?: string | null;
  anniversary?: string | null;
  visitFrequency?: number | null;
  /** The phone's GPS when the MR added the Doctor — becomes the registered location until Admin corrects it. */
  location: GeoPoint;
}

export type AddedDoctorView = DoctorView & { approval: { requestId: string; cycle: number; status: string } | null };

/**
 * An MR adds a Doctor (LLD field-master-data.md, Doctor-creation approval): the Doctor is created
 * `pending` and submitted as a `NEW_DOCTOR` request in one transaction, so it never exists without
 * its request. Offline-first: the phone sends a `clientRequestId` with the create, and a retry of
 * the same one returns the Doctor already made instead of adding a second.
 */
export class AddedDoctors {
  constructor(
    private readonly doctors: DoctorRepositoryPort,
    private readonly territory: TerritoryPort,
    private readonly approvals: ApprovalsPort,
    private readonly transactions: TransactionRunnerPort,
    private readonly views: DoctorViews,
    private readonly specialties: SpecialtyCatalog,
  ) {}

  /** `created: false` means this was a retry of an earlier, successful create. */
  async add(mrId: string, input: AddedDoctorInput & { clientRequestId: string }): Promise<{ doctor: AddedDoctorView; created: boolean }> {
    const earlier = await this.doctors.findByClientRequest(mrId, input.clientRequestId);
    if (earlier) return { doctor: await this.view(earlier), created: false };

    await this.requireOwnRoute(mrId, input.routeId);
    input = { ...input, specialty: await this.specialties.resolve(input.specialty) };
    const { clientRequestId } = input;
    try {
      const created = await this.transactions.run((ctx) => this.insertAndSubmit(mrId, input, ctx));
      return { doctor: await this.view(created), created: true };
    } catch (err) {
      if (!(err instanceof DuplicateRecordError)) throw err;
      // A racing retry of the same create got there first — hand back its Doctor.
      const winner = await this.doctors.findByClientRequest(mrId, clientRequestId);
      if (!winner) throw AppError.conflict('This doctor was added at the same time. Reload and try again.');
      return { doctor: await this.view(winner), created: false };
    }
  }

  /**
   * The same create, inside a transaction the caller already opened — the sync push's, for a Doctor the
   * MR added offline (LLD sync.md). `input.clientRequestId` is the record's sync client id. If an earlier
   * send already made this Doctor (through `add`, or a first push) that one is returned, so the same
   * client id can never make two. Throws `DuplicateRecordError` if a simultaneous send got in first —
   * the transaction is already doomed by then, so the caller reports it and the MR taps Submit again.
   */
  async addWithin(mrId: string, input: AddedDoctorInput & { clientRequestId: string }, ctx: TransactionContext): Promise<Doctor> {
    const earlier = await this.doctors.findByClientRequest(mrId, input.clientRequestId);
    if (earlier) return earlier;
    await this.requireOwnRoute(mrId, input.routeId);
    return this.insertAndSubmit(mrId, { ...input, specialty: await this.specialties.resolve(input.specialty) }, ctx);
  }

  private async insertAndSubmit(mrId: string, input: AddedDoctorInput & { clientRequestId: string }, ctx: TransactionContext): Promise<Doctor> {
    const { clientRequestId, location, ...fields } = input;
    const doctor = await this.doctors.createProposed(
      { dateOfBirth: null, anniversary: null, visitFrequency: null, ...fields, location, capturedLocation: location, clientRequestId, status: 'pending', addedBy: mrId, approvedAt: null },
      ctx,
    );
    await this.approvals.submit({ kind: NEW_DOCTOR_KIND, recordId: doctor.id, submitterId: mrId }, ctx);
    return doctor;
  }

  /** After a rejection, withdrawal or Admin reopen: change the Doctor and resubmit it as a new cycle. */
  async edit(mrId: string, doctorId: string, input: AddedDoctorInput): Promise<AddedDoctorView> {
    const existing = await this.doctors.findById(doctorId);
    if (!existing || existing.addedBy !== mrId || existing.clientRequestId === null) throw AppError.notFound('No such doctor.');
    const request = await this.approvals.getForRecord(NEW_DOCTOR_KIND, existing.id);
    if (!request || !isEditableBySubmitter(request.status)) {
      throw AppError.conflict(
        request?.status === 'APPROVED'
          ? 'This doctor is approved and can’t be changed. Ask Admin.'
          : 'This doctor is waiting for approval and can’t be changed. Withdraw it first.',
      );
    }
    if (input.routeId !== existing.routeId) await this.requireOwnRoute(mrId, input.routeId);
    input = { ...input, specialty: await this.specialties.resolve(input.specialty) };

    const updated = await this.transactions.run(async (ctx) => {
      const { location, ...fields } = input;
      const doctor = await this.doctors.update(existing.id, { ...fields, location, capturedLocation: location }, ctx);
      if (!doctor) throw AppError.notFound('No such doctor.');
      await this.approvals.submit({ kind: NEW_DOCTOR_KIND, recordId: doctor.id, submitterId: mrId }, ctx);
      return doctor;
    });
    return this.view(updated);
  }

  /** The Doctors this MR added, any status, newest first — with where each one is in its approval. */
  async list(mrId: string, page: PageQuery): Promise<PaginatedResult<AddedDoctorView>> {
    const { items, total } = await this.doctors.listAdded(mrId, page);
    const views = await Promise.all(items.map((d) => this.view(d)));
    return buildPaginatedResult(views, total, page);
  }

  private async view(doctor: Doctor): Promise<AddedDoctorView> {
    const [view, request] = await Promise.all([this.views.one(doctor), this.approvals.getForRecord(NEW_DOCTOR_KIND, doctor.id)]);
    return { ...view, approval: request && { requestId: request.id, cycle: request.cycle, status: request.status } };
  }

  /** An MR can only add a Doctor to a Route they currently have. */
  private async requireOwnRoute(mrId: string, routeId: string): Promise<void> {
    if (!(await this.territory.listRoutesForUser(mrId)).some((r) => r.id === routeId)) {
      throw AppError.badRequest('That route isn’t one of yours.', { field: 'routeId' });
    }
  }
}

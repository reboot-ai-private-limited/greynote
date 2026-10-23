import type { DoctorDeleteResultDto, DoctorImpactDto } from '@greynote/contracts';
import type { TransactionRunnerPort } from '@/shared/db/transaction.port.js';
import { AppError } from '@/shared/errors/AppError.js';
import { logger } from '@/shared/logging/logger.js';
import type { PhotoStoragePort } from '@/shared/storage/photoStorage.port.js';
import type { Doctor } from '../domain/doctor.entity.js';
import type { DoctorRepositoryPort } from '../domain/doctor.repository.port.js';
import type { DoctorAssignmentRepositoryPort } from '../domain/doctorAssignment.repository.port.js';
import { NO_DOCTOR_REFERENCES, type DoctorArchivePort, type DoctorReferencesPort } from '../domain/doctorRetirement.js';
import type { SampleAllocationRepositoryPort } from '../domain/sampleAllocation.repository.port.js';
import type { UserDirectoryPort } from '../domain/userDirectory.port.js';

/**
 * Taking a doctor out of service (decision-log 2026-10-22), Admin only: what it touches (`impact`), and the permanent `delete`.
 * Deactivating is `UpdateDoctorUseCase` with `status: inactive`; it and every lost assignment end in `release`.
 *
 * What other modules hold (calls, gifts, services, sample history, visuals, plans already submitted) is never deleted: a deleted
 * doctor's row moves to the archive, and the contract's `getDoctor` answers from it as `inactive`, so history keeps its name and
 * every new write is refused. Only Daily Plans still editable lose the doctor, or their submit would be refused.
 */
export class DoctorRetirement {
  private references: DoctorReferencesPort = { count: async () => NO_DOCTOR_REFERENCES, release: async () => 0 };

  constructor(
    private readonly doctors: DoctorRepositoryPort,
    private readonly assignments: DoctorAssignmentRepositoryPort,
    private readonly allocations: SampleAllocationRepositoryPort,
    private readonly archive: DoctorArchivePort,
    private readonly users: UserDirectoryPort,
    private readonly transactions: TransactionRunnerPort,
    private readonly photos: PhotoStoragePort | null = null,
  ) {}

  /** Planning, Field Activity and Marketing are built after this module; the composition root hands them in. */
  bind(references: DoctorReferencesPort): void {
    this.references = references;
  }

  private async settled(id: string): Promise<Doctor & { status: 'active' | 'inactive' }> {
    const doctor = await this.doctors.findById(id);
    if (!doctor) throw AppError.notFound('No such doctor.');
    if (doctor.status === 'pending') throw AppError.conflict('This doctor is waiting for approval. Approve or reject it in the approvals inbox.');
    return doctor as Doctor & { status: 'active' | 'inactive' };
  }

  async impact(id: string): Promise<DoctorImpactDto> {
    const doctor = await this.settled(id);
    const [assignment, allocations, references] = await Promise.all([
      this.assignments.findActiveForDoctor(id),
      this.allocations.listForDoctor(id),
      this.references.count(id),
    ]);
    const user = assignment ? await this.users.findUserSummary(assignment.userId) : null;
    return {
      id,
      name: doctor.name,
      status: doctor.status,
      assignedTo: assignment ? { userId: assignment.userId, name: user?.name ?? '', employeeCode: user?.employeeCode ?? '' } : null,
      plannedDays: references.plannedDays,
      calls: references.calls,
      openGifts: references.openGifts,
      openServices: references.openServices,
      sampleAllocations: allocations.length,
      samplesRemaining: allocations.reduce((sum, a) => sum + a.quantityRemaining, 0),
      visuals: references.visuals,
    };
  }

  /** Archives and deletes the doctor and its assignments in one transaction, then takes it off every editable plan. */
  async delete(id: string, actorId: string): Promise<DoctorDeleteResultDto> {
    const doctor = await this.settled(id);
    const assignment = await this.assignments.findActiveForDoctor(id);
    await this.transactions.run((ctx) => this.archive.remove(doctor, assignment?.userId ?? null, actorId, ctx));
    // The archive keeps no photo (history needs the name, not the face), so the stored file goes with the doctor. Best effort: the delete is done.
    if (doctor.photo && this.photos) {
      await this.photos.remove(doctor.photo.publicId).catch((err: unknown) => logger.error({ err, doctorId: id }, 'doctor delete: photo not removed from storage'));
    }
    return { id, plansUpdated: await this.release(id, null) };
  }

  /**
   * After the doctor's change is saved: off the editable plans of the MR who lost it (`userId`), or of everyone (`null`). A failure
   * here doesn't undo the change already made; it is logged, and the plan's own submit still refuses the doctor.
   */
  async release(doctorId: string, userId: string | null): Promise<number> {
    try {
      return await this.references.release(doctorId, userId);
    } catch (err) {
      logger.error({ err, doctorId, userId }, 'doctor release: plans not updated');
      return 0;
    }
  }

  /** For the contract's `getDoctor`: a live doctor, else a deleted one from the archive (as `inactive`). */
  async findIncludingDeleted(id: string): Promise<Doctor | null> {
    return (await this.doctors.findById(id)) ?? (await this.archive.findArchived(id));
  }
}

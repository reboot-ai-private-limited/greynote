import type { DoctorRepositoryPort } from '../domain/doctor.repository.port.js';
import type { DoctorAssignmentRepositoryPort } from '../domain/doctorAssignment.repository.port.js';
import type { ChemistAssignmentRepositoryPort } from '../domain/chemistAssignment.repository.port.js';
import type { DistributorRepositoryPort } from '../domain/distributor.repository.port.js';
import type { TerritoryPort } from '../domain/territory.port.js';
import type { DoctorRetirement } from './doctorRetirement.js';
import type { AssignDoctorUseCase } from './usecases/assignDoctor.usecase.js';

/**
 * What a leaving employee had here (decision-log 2026-10-22): the doctors assigned to them, and the distributors that list them.
 * Releasing hands each doctor to `handoverTo` where that person has the doctor's route (the usual assignment, so it also leaves
 * the leaver's plans), and leaves the rest unassigned, for Admin to give to someone; the leaver comes off every distributor.
 * Safe to run again: a doctor already moved or unassigned is no longer theirs.
 */
export class LeaverWork {
  constructor(
    private readonly doctors: DoctorRepositoryPort,
    private readonly assignments: DoctorAssignmentRepositoryPort,
    private readonly distributors: DistributorRepositoryPort,
    private readonly territory: TerritoryPort,
    private readonly assign: AssignDoctorUseCase,
    private readonly retirement: DoctorRetirement,
    private readonly chemistAssignments: ChemistAssignmentRepositoryPort,
  ) {}

  async count(userId: string): Promise<{ doctors: number; distributors: number }> {
    const [doctors, distributors] = await Promise.all([this.assignments.listActiveForUser(userId), this.distributors.countAssignee(userId)]);
    return { doctors: doctors.length, distributors };
  }

  async releaseDoctors(userId: string, handoverTo: string | null, actorId: string): Promise<{ handedOver: number; unassigned: number }> {
    const doctors = await this.assignments.listActiveForUser(userId);
    const takerRoutes = handoverTo ? new Set((await this.territory.listPlacesForUser(handoverTo)).map((p) => p.id)) : new Set<string>();
    let handedOver = 0;
    let unassigned = 0;
    for (const a of doctors) {
      if (handoverTo && (await this.canTake(a.doctorId, takerRoutes))) {
        await this.assign.execute(a.doctorId, handoverTo, actorId);
        handedOver++;
        continue;
      }
      if (await this.assignments.endActiveIfUser(a.doctorId, userId, actorId)) {
        await this.retirement.release(a.doctorId, userId);
        unassigned++;
      }
    }
    return { handedOver, unassigned };
  }

  /** The leaver comes off every chemist they hold; chemists others also hold stay with them. The rows are kept as history. */
  releaseChemists(userId: string, actorId: string): Promise<number> {
    return this.chemistAssignments.endAllForUser(userId, actorId);
  }

  releaseDistributors(userId: string): Promise<number> {
    return this.distributors.removeAssignee(userId);
  }

  /** The receiver must have the doctor's route, as any assignment requires; a doctor whose route they lack is left unassigned. */
  private async canTake(doctorId: string, takerRoutes: Set<string>): Promise<boolean> {
    const doctor = await this.doctors.findById(doctorId);
    return doctor !== null && doctor.status === 'active' && takerRoutes.has(doctor.placeId);
  }
}

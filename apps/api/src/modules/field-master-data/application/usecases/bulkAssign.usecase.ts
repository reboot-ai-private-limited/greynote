import { AppError } from '@/shared/errors/AppError.js';
import type { ChemistRepositoryPort } from '../../domain/chemist.repository.port.js';
import type { ChemistAssignmentRepositoryPort } from '../../domain/chemistAssignment.repository.port.js';
import type { DistributorRepositoryPort } from '../../domain/distributor.repository.port.js';
import type { DoctorRepositoryPort } from '../../domain/doctor.repository.port.js';
import type { DoctorAssignmentRepositoryPort } from '../../domain/doctorAssignment.repository.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { AssignChemistUseCase, UnassignChemistUseCase } from './chemistAssignments.usecase.js';
import type { UnassignDoctorUseCase } from './unassignDoctor.usecase.js';
import type { AssignDoctorUseCase } from './assignDoctor.usecase.js';
import type { UpdateDistributorUseCase } from './updateDistributor.usecase.js';

/**
 * What happened to one record in a bulk assign (decision-log 2026-11-19): `ASSIGNED` (now held by the employee), `MOVED` (a doctor that someone else held,
 * `from` says who), `ALREADY` (the employee held it already), `REMOVED` (taken off the employee), or `SKIPPED` with the reason (for example a doctor on a route the employee doesn't hold).
 */
export interface BulkAssignResult {
  id: string;
  name: string;
  outcome: 'ASSIGNED' | 'MOVED' | 'ALREADY' | 'REMOVED' | 'SKIPPED';
  from?: string | undefined;
  reason?: string | undefined;
}

const reasonOf = (err: unknown): string => (err instanceof AppError ? err.message : 'Could not assign it.');

/** Admin gives one employee several doctors at once. Each goes through the single-doctor rules (route held, replaces the old holder); one failure never stops the rest. */
export class BulkAssignDoctorsUseCase {
  constructor(
    private readonly doctors: DoctorRepositoryPort,
    private readonly assignments: DoctorAssignmentRepositoryPort,
    private readonly users: UserDirectoryPort,
    private readonly assign: AssignDoctorUseCase,
    private readonly unassign: UnassignDoctorUseCase,
  ) {}

  async execute(userId: string, ids: string[], adminId: string, removeIds: string[] = []): Promise<BulkAssignResult[]> {
    const results: BulkAssignResult[] = [];
    for (const id of [...new Set(ids)]) {
      const doctor = await this.doctors.findById(id);
      if (!doctor) {
        results.push({ id, name: 'Unknown doctor', outcome: 'SKIPPED', reason: 'No such doctor.' });
        continue;
      }
      const current = await this.assignments.findActiveForDoctor(id);
      if (current?.userId === userId) {
        results.push({ id, name: doctor.name, outcome: 'ALREADY' });
        continue;
      }
      try {
        await this.assign.execute(id, userId, adminId);
        const from = current ? (await this.users.findUserSummary(current.userId))?.name : undefined;
        results.push({ id, name: doctor.name, outcome: current ? 'MOVED' : 'ASSIGNED', from });
      } catch (err) {
        results.push({ id, name: doctor.name, outcome: 'SKIPPED', reason: reasonOf(err) });
      }
    }
    // Held ones unticked in the picker: taken off this employee (nobody holds the doctor after, until it is assigned again).
    for (const id of [...new Set(removeIds)]) {
      const doctor = await this.doctors.findById(id);
      try {
        await this.unassign.execute(id, userId, adminId);
        results.push({ id, name: doctor?.name ?? 'Unknown doctor', outcome: 'REMOVED' });
      } catch (err) {
        results.push({ id, name: doctor?.name ?? 'Unknown doctor', outcome: 'SKIPPED', reason: reasonOf(err) });
      }
    }
    return results;
  }
}

/** Admin gives one employee several chemists at once; others who hold them keep them. */
export class BulkAssignChemistsUseCase {
  constructor(
    private readonly chemists: ChemistRepositoryPort,
    private readonly assignments: ChemistAssignmentRepositoryPort,
    private readonly assign: AssignChemistUseCase,
    private readonly unassign: UnassignChemistUseCase,
  ) {}

  async execute(userId: string, ids: string[], adminId: string, removeIds: string[] = []): Promise<BulkAssignResult[]> {
    const results: BulkAssignResult[] = [];
    for (const id of [...new Set(ids)]) {
      const chemist = await this.chemists.findById(id);
      if (!chemist) {
        results.push({ id, name: 'Unknown chemist', outcome: 'SKIPPED', reason: 'No such chemist.' });
        continue;
      }
      if (await this.assignments.isAssigned(userId, id)) {
        results.push({ id, name: chemist.name, outcome: 'ALREADY' });
        continue;
      }
      try {
        await this.assign.execute(id, userId, adminId);
        results.push({ id, name: chemist.name, outcome: 'ASSIGNED' });
      } catch (err) {
        results.push({ id, name: chemist.name, outcome: 'SKIPPED', reason: reasonOf(err) });
      }
    }
    // Held ones unticked in the picker: taken off this employee only; the others who hold the chemist keep it.
    for (const id of [...new Set(removeIds)]) {
      const chemist = await this.chemists.findById(id);
      try {
        await this.unassign.execute(id, userId, adminId);
        results.push({ id, name: chemist?.name ?? 'Unknown chemist', outcome: 'REMOVED' });
      } catch (err) {
        results.push({ id, name: chemist?.name ?? 'Unknown chemist', outcome: 'SKIPPED', reason: reasonOf(err) });
      }
    }
    return results;
  }
}

/** Admin or the Accountant gives one employee several distributors at once; the others assigned to them stay. */
export class BulkAssignDistributorsUseCase {
  constructor(
    private readonly distributors: DistributorRepositoryPort,
    private readonly update: UpdateDistributorUseCase,
  ) {}

  async execute(userId: string, ids: string[], removeIds: string[] = []): Promise<BulkAssignResult[]> {
    const results: BulkAssignResult[] = [];
    for (const id of [...new Set(ids)]) {
      const distributor = await this.distributors.findById(id);
      if (!distributor) {
        results.push({ id, name: 'Unknown distributor', outcome: 'SKIPPED', reason: 'No such distributor.' });
        continue;
      }
      if (distributor.assignedUserIds.includes(userId)) {
        results.push({ id, name: distributor.name, outcome: 'ALREADY' });
        continue;
      }
      if (distributor.status !== 'active') {
        results.push({ id, name: distributor.name, outcome: 'SKIPPED', reason: 'This distributor is not active.' });
        continue;
      }
      try {
        await this.update.execute(id, { assignedUserIds: [...distributor.assignedUserIds, userId] });
        results.push({ id, name: distributor.name, outcome: 'ASSIGNED' });
      } catch (err) {
        results.push({ id, name: distributor.name, outcome: 'SKIPPED', reason: reasonOf(err) });
      }
    }
    // Held ones unticked in the picker: taken off this employee only.
    for (const id of [...new Set(removeIds)]) {
      const distributor = await this.distributors.findById(id);
      if (!distributor) {
        results.push({ id, name: 'Unknown distributor', outcome: 'SKIPPED', reason: 'No such distributor.' });
        continue;
      }
      if (!distributor.assignedUserIds.includes(userId)) {
        results.push({ id, name: distributor.name, outcome: 'SKIPPED', reason: 'This employee is not assigned to it.' });
        continue;
      }
      try {
        await this.update.execute(id, { assignedUserIds: distributor.assignedUserIds.filter((u) => u !== userId) });
        results.push({ id, name: distributor.name, outcome: 'REMOVED' });
      } catch (err) {
        results.push({ id, name: distributor.name, outcome: 'SKIPPED', reason: reasonOf(err) });
      }
    }
    return results;
  }
}

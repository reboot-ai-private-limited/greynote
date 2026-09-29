import type { Doctor } from '../domain/doctor.entity.js';
import type { DoctorAssignmentRepositoryPort } from '../domain/doctorAssignment.repository.port.js';
import type { UserDirectoryPort } from '../domain/userDirectory.port.js';

export type DoctorView = Doctor & { assignedTo: { userId: string; name: string; employeeCode: string } | null };

/** Attaches "who is responsible for this Doctor" to Doctors for the API, in two queries however many. */
export class DoctorViews {
  constructor(
    private readonly assignments: DoctorAssignmentRepositoryPort,
    private readonly users: UserDirectoryPort,
  ) {}

  async many<T extends Doctor>(doctors: T[]): Promise<Array<T & Pick<DoctorView, 'assignedTo'>>> {
    const active = await this.assignments.findActiveForDoctors(doctors.map((d) => d.id));
    const byUser = new Map((await this.users.getUserSummaries([...new Set(active.map((a) => a.userId))])).map((u) => [u.id, u]));
    const assigneeOf = new Map(active.map((a) => [a.doctorId, a.userId]));
    return doctors.map((d) => {
      const user = byUser.get(assigneeOf.get(d.id) ?? '');
      return { ...d, assignedTo: user ? { userId: user.id, name: user.name, employeeCode: user.employeeCode } : null };
    });
  }

  async one(doctor: Doctor): Promise<DoctorView> {
    return (await this.many([doctor]))[0]!;
  }
}

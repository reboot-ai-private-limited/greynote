import type { ApprovalsPort } from '../domain/approvals.port.js';
import type { Doctor } from '../domain/doctor.entity.js';
import type { DoctorAssignmentRepositoryPort } from '../domain/doctorAssignment.repository.port.js';
import type { UserDirectoryPort } from '../domain/userDirectory.port.js';
import { NEW_DOCTOR_KIND } from './doctorApproval.js';

/** `approvalRequestId`: a pending doctor's NEW_DOCTOR request, so a list row can open it; `null` for every other doctor. */
export type DoctorView = Omit<Doctor, 'photo'> & {
  /** The photo's address; the storage id (`Doctor.photo.publicId`) is not sent to clients. */
  photoUrl: string | null; assignedTo: { userId: string; name: string; employeeCode: string } | null; approvalRequestId: string | null };

/** A Doctor, or one already turned into a view (no storage `photo`). */
type DoctorLike = Omit<Doctor, 'photo'> & { photo?: Doctor['photo'] };

/** Attaches "who is responsible for this Doctor" to Doctors for the API, in two queries however many, and a pending one's approval request. */
export class DoctorViews {
  constructor(
    private readonly assignments: DoctorAssignmentRepositoryPort,
    private readonly users: UserDirectoryPort,
    private readonly approvals: Pick<ApprovalsPort, 'getForRecord'> | null = null,
  ) {}

  async many<T extends DoctorLike>(doctors: T[]): Promise<Array<Omit<T, 'photo'> & Pick<DoctorView, 'photoUrl' | 'assignedTo' | 'approvalRequestId'>>> {
    const active = await this.assignments.findActiveForDoctors(doctors.map((d) => d.id));
    const byUser = new Map((await this.users.getUserSummaries([...new Set(active.map((a) => a.userId))])).map((u) => [u.id, u]));
    const assigneeOf = new Map(active.map((a) => [a.doctorId, a.userId]));
    // Only pending doctors have an open request worth linking to: one lookup each, at most a page of them.
    const requests = new Map(
      await Promise.all(
        doctors
          .filter((d) => d.status === 'pending' && this.approvals)
          .map(async (d) => [d.id, (await this.approvals!.getForRecord(NEW_DOCTOR_KIND, d.id))?.id ?? null] as const),
      ),
    );
    return doctors.map(({ photo, ...d }) => {
      const user = byUser.get(assigneeOf.get(d.id) ?? '');
      return { ...d, photoUrl: photo?.url ?? null, assignedTo: user ? { userId: user.id, name: user.name, employeeCode: user.employeeCode } : null, approvalRequestId: requests.get(d.id) ?? null };
    });
  }

  async one(doctor: DoctorLike): Promise<DoctorView> {
    return (await this.many([doctor]))[0]!;
  }
}

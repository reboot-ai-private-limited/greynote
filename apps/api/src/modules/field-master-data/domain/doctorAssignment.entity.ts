/**
 * The Doctor ↔ MR responsibility link. At most one `active` row per doctor; older rows are history
 * (reassigning ends the current one and starts a new one).
 */
export interface DoctorAssignment {
  id: string;
  doctorId: string;
  userId: string;
  status: 'active' | 'inactive';
  assignedAt: Date;
  assignedBy: string;
  unassignedAt: Date | null;
  unassignedBy: string | null;
}

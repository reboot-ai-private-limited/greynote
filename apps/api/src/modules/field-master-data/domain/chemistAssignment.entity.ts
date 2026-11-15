/**
 * The Chemist ↔ MR link. Unlike a Doctor (one MR), a Chemist can have many MRs at once: one `active` row per (chemist, MR).
 * Ending a row keeps it as history. This link, not the Route, is what makes a Chemist visible to an MR (decision-log 2026-11-16).
 */
export interface ChemistAssignment {
  id: string;
  chemistId: string;
  userId: string;
  status: 'active' | 'inactive';
  assignedAt: Date;
  assignedBy: string;
  unassignedAt: Date | null;
  unassignedBy: string | null;
}

import type { MasterStatus } from './masterStatus.js';

/**
 * A doctor's speciality, chosen from a list an Admin keeps (decision-log 2026-10-06). A Doctor stores the speciality's name; renaming one
 * renames it on its Doctors too. There is no rank. Deactivating hides it from new choices and leaves existing Doctors as they are.
 */
export interface Specialty {
  id: string;
  /** Unique ignoring case and surrounding spaces. */
  name: string;
  status: MasterStatus;
}

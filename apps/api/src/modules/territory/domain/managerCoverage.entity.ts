/**
 * Where a manager (ASM and above) works, so the employee wizard offers only managers who cover the new employee's HQ.
 * An ASM or RSM covers several HQs (an RSM's "region" is just that set); a ZSM covers whole Zones; the NSM needs no entry, since
 * the NSM covers everywhere. Eligibility only: approval routing and the downline still follow `managerId` alone.
 */
export interface ManagerCoverage {
  userId: string;
  hqIds: string[];
  zoneIds: string[];
  updatedAt: Date;
  updatedBy: string;
}

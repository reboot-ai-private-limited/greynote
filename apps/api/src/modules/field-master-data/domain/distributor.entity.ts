import type { GeoPoint, MasterStatus } from './masterStatus.js';

/**
 * A distributor on a Route (client rules §17.2; Zone/HQ are reached through the Route, never
 * stored). One assigned MR and one assigned ASM at a time (sign-off C2). Orders and monthly stock
 * against it belong to Sales & Orders.
 */
export interface Distributor {
  id: string;
  routeId: string;
  name: string;
  gstNumber: string;
  contactPerson: string;
  mobile: string;
  address: string;
  location: GeoPoint | null;
  assignedMrId: string | null;
  assignedAsmId: string | null;
  primarySalesEnabled: boolean;
  secondarySalesEnabled: boolean;
  status: MasterStatus;
}

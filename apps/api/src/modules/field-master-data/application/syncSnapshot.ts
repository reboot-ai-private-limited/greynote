import type { FieldMasterDataSnapshot } from '@greynote/contracts';
import type { SyncSourceDefinition } from '@/modules/sync/sync.public.js';
import type { ChemistRepositoryPort } from '../domain/chemist.repository.port.js';
import type { DistributorRepositoryPort } from '../domain/distributor.repository.port.js';
import type { DoctorRepositoryPort } from '../domain/doctor.repository.port.js';
import type { SpecialtyRepositoryPort } from '../domain/specialty.repository.port.js';
import type { ProductRepositoryPort } from '../domain/product.repository.port.js';
import type { SampleAllocationRepositoryPort } from '../domain/sampleAllocation.repository.port.js';
import type { TerritoryPort } from '../domain/territory.port.js';
import type { DoctorVisibility } from './doctorVisibility.js';

export const FIELD_MASTER_DATA_SYNC_SOURCE = 'fieldMasterData';

/**
 * What the MR's phone caches of Field Master Data (LLD sync.md, Pull) — the **whole** picture of what
 * this user may see, as one snapshot, never a change list. That is the point of a snapshot here: a Doctor
 * appears when the MR gains its Route and vanishes when they lose it (`DOCTOR_VISIBILITY_FOLLOWS_ROUTE`),
 * neither of which changes the Doctor row a delta would watch.
 *
 * - `doctors` — the MR's own, by the same visibility rule as `GET /doctors/mine`.
 * - `pendingDoctors` — the ones they added that are waiting for approval, so the phone can show them.
 * - `chemists` — active, on the Routes the MR currently has.
 * - `distributors` — active ones the MR is assigned to, or that sit on one of their Routes.
 * - `products` — the active catalog.
 * - `sampleAllocations` — what's left to give, for exactly those Doctors.
 *
 * Only what the app needs: nothing about who else was assigned, the phone's original capture point, or
 * approval internals. Every list is sorted by a stable key so an unchanged world gives the same version.
 */
export function makeFieldMasterDataSource(deps: {
  doctors: DoctorRepositoryPort;
  chemists: ChemistRepositoryPort;
  products: ProductRepositoryPort;
  specialties: SpecialtyRepositoryPort;
  distributors: DistributorRepositoryPort;
  allocations: SampleAllocationRepositoryPort;
  visibility: DoctorVisibility;
  territory: TerritoryPort;
}): SyncSourceDefinition {
  const byId = <T extends { id: string }>(rows: T[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
  return {
    name: FIELD_MASTER_DATA_SYNC_SOURCE,
    async snapshot(userId): Promise<FieldMasterDataSnapshot> {
      const [scopes, routes] = await Promise.all([deps.visibility.scopes([userId]), deps.territory.listRoutesForUser(userId)]);
      const routeIds = routes.map((r) => r.id);
      const [{ items: mine }, pending, chemists, distributors, products, specialties] = await Promise.all([
        deps.doctors.listAssigned(scopes, {}, null),
        deps.doctors.listPendingAdded(userId),
        deps.chemists.listActiveOnRoutes(routeIds),
        deps.distributors.listActiveForUser(userId, routeIds),
        deps.products.listActive(),
        deps.specialties.listActive(),
      ]);
      const allocations = await deps.allocations.listForDoctors(mine.map((d) => d.id));
      return {
        doctors: byId(mine).map((d) => ({
          id: d.id,
          routeId: d.routeId,
          name: d.name,
          address: d.address,
          email: d.email,
          clinicName: d.clinicName,
          phone: d.phone,
          specialty: d.specialty,
          qualification: d.qualification,
          dateOfBirth: d.dateOfBirth,
          anniversary: d.anniversary,
          visitFrequency: d.visitFrequency,
          location: d.location,
        })),
        pendingDoctors: byId(pending).map((d) => ({ id: d.id, routeId: d.routeId, name: d.name, address: d.address, specialty: d.specialty, qualification: d.qualification, location: d.location })),
        chemists: byId(chemists).map((c) => ({ id: c.id, routeId: c.routeId, name: c.name, address: c.address, location: c.location })),
        distributors: byId(distributors).map((d) => ({
          id: d.id,
          routeIds: d.routeIds,
          name: d.name,
          gstNumber: d.gstNumber,
          contactPerson: d.contactPerson,
          mobile: d.mobile,
          address: d.address,
          location: d.location,
        })),
        specialties: specialties.map((s) => s.name),
        products: byId(products).map((p) => ({ id: p.id, name: p.name, sku: p.sku, category: p.category, composition: p.composition, type: p.type, packSize: p.packSize, ptsPaise: p.ptsPaise, ptrPaise: p.ptrPaise, mrpPaise: p.mrpPaise, gstPercent: p.gstPercent, division: p.division })),
        sampleAllocations: byId(allocations).map((a) => ({ id: a.id, doctorId: a.doctorId, productId: a.productId, quantityAllocated: a.quantityAllocated, quantityRemaining: a.quantityRemaining })),
      };
    },
  };
}

import type { FieldMasterDataSnapshot } from '@greynote/contracts';
import type { SyncSourceDefinition } from '@/modules/sync/sync.public.js';
import type { ChemistRepositoryPort } from '../domain/chemist.repository.port.js';
import type { ChemistAssignmentRepositoryPort } from '../domain/chemistAssignment.repository.port.js';
import type { DistributorRepositoryPort } from '../domain/distributor.repository.port.js';
import type { DoctorRepositoryPort } from '../domain/doctor.repository.port.js';
import type { SpecialtyRepositoryPort } from '../domain/specialty.repository.port.js';
import type { ProductRepositoryPort } from '../domain/product.repository.port.js';
import type { SampleAllocationRepositoryPort } from '../domain/sampleAllocation.repository.port.js';
import type { TerritoryPort } from '../domain/territory.port.js';
import type { UserDirectoryPort } from '../domain/userDirectory.port.js';
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
 * - `chemists` — active ones held by the person, and for a manager by anyone below them (own first, capped).
 * - `distributors` — active ones handed to the person, and for a manager to anyone below them (2026-11-27), with their places.
 *   `routeIds` is sent empty: places replaced routes, and the key stays so an older build still parses.
 * - `products` — the active catalog.
 * - `sampleAllocations` — always empty since 2026-11 (samples are the employee's own credit); kept so older builds parse.
 *
 * Only what the app needs: nothing about who else was assigned, the phone's original capture point, or
 * approval internals. Every list is sorted by a stable key so an unchanged world gives the same version.
 */
/** A manager's chemist list is capped so a ZSM or NSM's phone cache stays small; their own chemists are never cut. */
export const MAX_SNAPSHOT_CHEMISTS = 2000;

export function makeFieldMasterDataSource(deps: {
  doctors: DoctorRepositoryPort;
  chemists: ChemistRepositoryPort;
  chemistAssignments: ChemistAssignmentRepositoryPort;
  products: ProductRepositoryPort;
  specialties: SpecialtyRepositoryPort;
  distributors: DistributorRepositoryPort;
  allocations: SampleAllocationRepositoryPort;
  visibility: DoctorVisibility;
  territory: TerritoryPort;
  users: UserDirectoryPort;
}): SyncSourceDefinition {
  const byId = <T extends { id: string }>(rows: T[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
  /**
   * The chemists a call can be made on (2026-11-23): the ones assigned to the person and, for a manager, those held by anyone below them
   * (an MR has nobody below, so only their own). The phone's chemist picker reads only this list, and the server accepts a manager's call on a
   * team chemist (`CallChecks.chemist`). The person's own come first so the cap never drops them.
   */
  const chemistsFor = async (userId: string, people: string[]) => {
    const rows = await deps.chemistAssignments.listActiveForUsers(people);
    const own = rows.filter((r) => r.userId === userId).map((r) => r.chemistId);
    const others = rows.filter((r) => r.userId !== userId).map((r) => r.chemistId).sort();
    const ids = [...new Set([...own, ...others])].slice(0, MAX_SNAPSHOT_CHEMISTS);
    return (await deps.chemists.listActiveAmong(ids, {}, { page: 1, pageSize: 100_000 })).items;
  };
  return {
    name: FIELD_MASTER_DATA_SYNC_SOURCE,
    async snapshot(userId): Promise<FieldMasterDataSnapshot> {
      const scopes = await deps.visibility.scopes([userId]);
      const team = [userId, ...(await deps.users.getDownline(userId)).map((u) => u.id)];
      const [{ items: mine }, pending, chemists, { items: distributors }, products, specialties] = await Promise.all([
        deps.doctors.listAssigned(scopes, {}, null),
        deps.doctors.listPendingAdded(userId),
        chemistsFor(userId, team),
        deps.distributors.listActiveAssignedToAny(team, {}, { page: 1, pageSize: MAX_SNAPSHOT_CHEMISTS }),
        deps.products.listActive(),
        deps.specialties.listActive(),
      ]);
      return {
        doctors: byId(mine).map((d) => ({
          id: d.id,
          routeId: d.routeId,
          placeId: d.placeId,
          name: d.name,
          address: d.address,
          email: d.email,
          clinicName: d.clinicName,
          phone: d.phone,
          photoUrl: d.photo?.url ?? null,
          specialty: d.specialty,
          qualification: d.qualification,
          dateOfBirth: d.dateOfBirth,
          anniversary: d.anniversary,
          visitFrequency: d.visitFrequency,
          location: d.location,
        })),
        pendingDoctors: byId(pending).map((d) => ({ id: d.id, routeId: d.routeId, placeId: d.placeId, name: d.name, address: d.address, specialty: d.specialty, qualification: d.qualification, location: d.location, photoUrl: d.photo?.url ?? null })),
        chemists: byId(chemists).map((c) => ({ id: c.id, routeId: c.routeId, placeId: c.placeId, name: c.name, address: c.address, phone: c.phone, location: c.location })),
        distributors: byId(distributors).map((d) => ({
          id: d.id,
          routeIds: [],
          placeIds: d.placeIds,
          name: d.name,
          gstNumber: d.gstNumber,
          contactPerson: d.contactPerson,
          mobile: d.mobile,
          address: d.address,
          location: d.location,
        })),
        specialties: specialties.map((s) => s.name),
        products: byId(products).map((p) => ({ id: p.id, name: p.name, sku: p.sku, category: p.category, composition: p.composition, type: p.type, packSize: p.packSize, ptsPaise: p.ptsPaise, ptrPaise: p.ptrPaise, mrpPaise: p.mrpPaise, gstPercent: p.gstPercent, division: p.division })),
        // Samples are the employee's own credit now (2026-11): no per-doctor allocation goes to the phone. The key stays (empty) so an older build still parses the snapshot.
        sampleAllocations: [],
      };
    },
  };
}

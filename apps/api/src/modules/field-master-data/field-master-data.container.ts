import type { Router } from 'express';
import { Types } from 'mongoose';
import { ChemistModel } from './infrastructure/chemist.schema.js';
import { DistributorModel } from './infrastructure/distributor.schema.js';
import { DoctorModel } from './infrastructure/doctor.schema.js';
import type { ConfigReader } from '@/shared/config/readConfig.js';
import type { SyncPublicContract } from '@/modules/sync/sync.public.js';
import { MongooseTransactionRunner } from '@/shared/db/mongooseTransactionRunner.js';
import { makeFieldMasterDataSource } from './application/syncSnapshot.js';
import { makeNewDoctorSyncHandler } from './application/newDoctorSync.js';
import { ReviewPendingDoctorUseCase } from './application/usecases/reviewPendingDoctor.usecase.js';
import { makeDoctorApprovalHandler, NEW_DOCTOR_KIND } from './application/doctorApproval.js';
import { DoctorVisibility } from './application/doctorVisibility.js';
import { DoctorViews } from './application/doctorViews.js';
import { DoctorRetirement } from './application/doctorRetirement.js';
import { LeaverWork } from './application/leaverWork.js';
import type { DoctorReferencesPort } from './domain/doctorRetirement.js';
import { MongoDoctorArchiveAdapter } from './infrastructure/mongoDoctorArchive.adapter.js';
import { AddedDoctors } from './application/usecases/addedDoctors.js';
import { AdjustSampleAllocationUseCase } from './application/usecases/adjustSampleAllocation.usecase.js';
import { AssignDoctorUseCase } from './application/usecases/assignDoctor.usecase.js';
import { CreateSpecialtyUseCase, GetSpecialtyUseCase, ListSpecialtiesUseCase, UpdateSpecialtyUseCase } from './application/usecases/specialties.usecase.js';
import { SpecialtyCatalog } from './application/specialtyCatalog.js';
import { MongoSpecialtyAdapter } from './infrastructure/mongoSpecialty.adapter.js';
import { CreateChemistUseCase } from './application/usecases/createChemist.usecase.js';
import { CreateDistributorUseCase } from './application/usecases/createDistributor.usecase.js';
import { CreateDoctorUseCase } from './application/usecases/createDoctor.usecase.js';
import { CreateProductUseCase } from './application/usecases/createProduct.usecase.js';
import { GetChemistUseCase } from './application/usecases/getChemist.usecase.js';
import { GetDistributorUseCase } from './application/usecases/getDistributor.usecase.js';
import { GetDoctorUseCase } from './application/usecases/getDoctor.usecase.js';
import { GetProductUseCase } from './application/usecases/getProduct.usecase.js';
import { ListChemistsUseCase } from './application/usecases/listChemists.usecase.js';
import { IssueSampleAllocationUseCase } from './application/usecases/issueSampleAllocation.usecase.js';
import { ListAssignedDoctorsUseCase } from './application/usecases/listAssignedDoctors.usecase.js';
import { ListDoctorAssignmentsUseCase } from './application/usecases/listDoctorAssignments.usecase.js';
import { ListDistributorsUseCase } from './application/usecases/listDistributors.usecase.js';
import { ListDoctorsUseCase } from './application/usecases/listDoctors.usecase.js';
import { ListProductsUseCase } from './application/usecases/listProducts.usecase.js';
import { ListSampleAllocationsUseCase } from './application/usecases/listSampleAllocations.usecase.js';
import { UnassignDoctorUseCase } from './application/usecases/unassignDoctor.usecase.js';
import { UpdateChemistUseCase } from './application/usecases/updateChemist.usecase.js';
import { UpdateDistributorUseCase } from './application/usecases/updateDistributor.usecase.js';
import { UpdateDoctorUseCase } from './application/usecases/updateDoctor.usecase.js';
import { UpdateDoctorTargetsUseCase } from './application/usecases/updateDoctorTargets.usecase.js';
import { UpdateProductUseCase } from './application/usecases/updateProduct.usecase.js';
import type { ApprovalsPort } from './domain/approvals.port.js';
import type { TerritoryPort } from './domain/territory.port.js';
import type { UserDirectoryPort } from './domain/userDirectory.port.js';
import type { FieldMasterDataPublicContract } from './field-master-data.public.js';
import { MongoChemistAdapter } from './infrastructure/mongoChemist.adapter.js';
import { MongoDistributorAdapter } from './infrastructure/mongoDistributor.adapter.js';
import { MongoDoctorAdapter } from './infrastructure/mongoDoctor.adapter.js';
import { MongoDoctorAssignmentAdapter } from './infrastructure/mongoDoctorAssignment.adapter.js';
import { MongoProductAdapter } from './infrastructure/mongoProduct.adapter.js';
import { MongoSampleAllocationAdapter } from './infrastructure/mongoSampleAllocation.adapter.js';
import { editAddedDoctorBodySchema } from './interface/field-master-data.schemas.js';
import { makeChemistControllers, makeDistributorControllers, makeDoctorControllers, makeProductControllers, makeSpecialtyControllers } from './interface/field-master-data.controller.js';
import { buildFieldMasterDataRouter } from './interface/field-master-data.route.js';

export interface FieldMasterDataContainer {
  contract: FieldMasterDataPublicContract;
  buildRouter: () => Router;
  /**
   * Planning, Field Activity and Marketing hold records that point at doctors and are built after this module: what a doctor's
   * deactivate or delete touches is counted, and its editable plans cleaned, through them once they exist.
   */
  bindDoctorReferences(references: DoctorReferencesPort): void;
}

/** Identity's, Territory's, Approval's, Sync's and Config's public contracts, passed in by the composition root. */
export function buildFieldMasterDataContainer(
  users: UserDirectoryPort,
  territory: TerritoryPort,
  approvals: ApprovalsPort,
  sync: SyncPublicContract,
  config: ConfigReader,
): FieldMasterDataContainer {
  // 1. Adapters
  const products = new MongoProductAdapter();
  const chemists = new MongoChemistAdapter();
  const specialties = new MongoSpecialtyAdapter();
  const specialtyCatalog = new SpecialtyCatalog(specialties);
  const distributors = new MongoDistributorAdapter();
  const sampleAllocations = new MongoSampleAllocationAdapter();
  const doctors = new MongoDoctorAdapter();
  const assignments = new MongoDoctorAssignmentAdapter();
  const transactions = new MongooseTransactionRunner();

  // An MR-added Doctor: Employee → Manager → Admin (sign-off C4). Approval makes it active and, per
  // config, assigns it to the MR who added it.
  approvals.registerKind({
    kind: NEW_DOCTOR_KIND,
    finalApproverRoles: ['ADMIN'],
    // The manager's approval is the decision (Admin can still decide at any time); no second stage.
    managerOnly: true,
    onStatusChange: makeDoctorApprovalHandler(doctors, assignments, users, territory, config),
  });

  // 2. Use cases
  const productUseCases = {
    list: new ListProductsUseCase(products),
    create: new CreateProductUseCase(products),
    get: new GetProductUseCase(products),
    update: new UpdateProductUseCase(products),
  };
  const specialtyUseCases = {
    list: new ListSpecialtiesUseCase(specialties),
    create: new CreateSpecialtyUseCase(specialties),
    get: new GetSpecialtyUseCase(specialties),
    update: new UpdateSpecialtyUseCase(specialties, doctors),
  };
  const chemistUseCases = {
    list: new ListChemistsUseCase(chemists),
    create: new CreateChemistUseCase(chemists, territory),
    get: new GetChemistUseCase(chemists),
    update: new UpdateChemistUseCase(chemists, territory),
  };

  const visibility = new DoctorVisibility(assignments, territory, users, config);
  const views = new DoctorViews(assignments, users, approvals);
  // The same add-Doctor logic, for a Doctor the MR added offline: it arrives in the daily report's push
  // (sync kind NEW_DOCTOR) and is created inside the sync engine's transaction.
  const addedDoctors = new AddedDoctors(doctors, territory, approvals, transactions, views, specialtyCatalog);
  sync.registerHandler(makeNewDoctorSyncHandler(addedDoctors, (payload) => editAddedDoctorBodySchema.parse(payload)));
  // …and what the phone caches of this module, as one snapshot of what the caller may see.
  sync.registerSource(makeFieldMasterDataSource({ doctors, chemists, products, specialties, distributors, allocations: sampleAllocations, visibility, territory }));

  const retirement = new DoctorRetirement(doctors, assignments, sampleAllocations, new MongoDoctorArchiveAdapter(), users, transactions);
  const updateDoctor = new UpdateDoctorUseCase(doctors, assignments, territory, views, specialtyCatalog, transactions, retirement);
  const assignDoctor = new AssignDoctorUseCase(doctors, assignments, users, territory, transactions, retirement);
  const leaverWork = new LeaverWork(doctors, assignments, distributors, territory, assignDoctor, retirement);
  const doctorUseCases = {
    list: new ListDoctorsUseCase(doctors, views),
    create: new CreateDoctorUseCase(doctors, territory, views, specialtyCatalog),
    get: new GetDoctorUseCase(doctors, visibility, views),
    update: updateDoctor,
    review: new ReviewPendingDoctorUseCase(doctors, users, updateDoctor),
    updateTargets: new UpdateDoctorTargetsUseCase(doctors, visibility, views),
    assigned: new ListAssignedDoctorsUseCase(doctors, visibility, users, views),
    listAssignments: new ListDoctorAssignmentsUseCase(doctors, assignments),
    assign: assignDoctor,
    unassign: new UnassignDoctorUseCase(assignments, retirement),
    retirement,
    addedDoctors,
    listSamples: new ListSampleAllocationsUseCase(sampleAllocations, doctors, products, visibility),
    issueSample: new IssueSampleAllocationUseCase(sampleAllocations, doctors, products),
    adjustSample: new AdjustSampleAllocationUseCase(sampleAllocations),
  };
  const distributorUseCases = {
    list: new ListDistributorsUseCase(distributors, territory),
    create: new CreateDistributorUseCase(distributors, territory, users),
    get: new GetDistributorUseCase(distributors, territory),
    update: new UpdateDistributorUseCase(distributors, territory, users),
  };

  return {
    contract: {
      countLeaverWork: (userId) => leaverWork.count(userId),
      releaseLeaverDoctors: (userId, handoverTo, actorId) => leaverWork.releaseDoctors(userId, handoverTo, actorId),
      releaseLeaverDistributors: (userId) => leaverWork.releaseDistributors(userId),
      countOnRoutes: async (routeIds) => {
        if (routeIds.length === 0) return { doctors: 0, chemists: 0, distributors: 0 };
        const ids = routeIds.map((id) => new Types.ObjectId(id));
        const [doctorCount, chemistCount, distributorCount] = await Promise.all([
          DoctorModel.countDocuments({ routeId: { $in: ids } }),
          ChemistModel.countDocuments({ routeId: { $in: ids } }),
          DistributorModel.countDocuments({ routeIds: { $in: ids } }),
        ]);
        return { doctors: doctorCount, chemists: chemistCount, distributors: distributorCount };
      },
            // A `pending` Doctor doesn't exist yet as far as other modules are concerned.
      getDoctorLocation: async (id) => {
        const doctor = await doctors.findById(id);
        return doctor && doctor.status !== 'pending' ? doctor.location : null;
      },
      // A deleted doctor still answers, from the archive, as `inactive`: history keeps its name and new writes refuse it.
      getDoctor: async (id) => {
        const doctor = await retirement.findIncludingDeleted(id);
        return doctor && doctor.status !== 'pending' ? doctor : null;
      },
      isAssignedToDoctor: async (userId, doctorId) => {
        const doctor = await doctors.findById(doctorId);
        return doctor !== null && (await visibility.isVisibleToAssignee(userId, doctor));
      },
      getAssignedUserId: async (doctorId) => {
        const doctor = await doctors.findById(doctorId);
        if (!doctor || doctor.status !== 'active') return null;
        return (await assignments.findActiveForDoctor(doctorId))?.userId ?? null;
      },
      listAssignedDoctors: async (userId) => {
        const { items } = await doctors.listAssigned(await visibility.scopes([userId]), {}, null);
        return items.map(({ assignedUserId: _assignedUserId, ...doctor }) => doctor);
      },
      getDistributor: (id) => distributors.findById(id),
      listDistributorAssignees: async () => (await distributors.listAllActive()).map((d) => ({ id: d.id, assignedUserIds: d.assignedUserIds })),
      listActiveOutlets: async () => {
        const [ds, cs] = await Promise.all([distributors.listAllActive(), chemists.listAllActive()]);
        return { distributors: ds.map((d) => ({ id: d.id, name: d.name })), chemists: cs.map((c) => ({ id: c.id, name: c.name })) };
      },
      listNames: async (q) => {
        const [ds, cs, ps] = await Promise.all([distributors.findByIds(q.distributorIds ?? []), chemists.findByIds(q.chemistIds ?? []), products.findByIds(q.productIds ?? [])]);
        return {
          distributors: ds.map((d) => ({ id: d.id, name: d.name })),
          chemists: cs.map((c) => ({ id: c.id, name: c.name })),
          products: ps.map((p) => ({ id: p.id, name: p.name, sku: p.sku, division: p.division, ptsPaise: p.ptsPaise, ptrPaise: p.ptrPaise, mrpPaise: p.mrpPaise })),
        };
      },
      canActOnDistributor: async (userId, distributorId) => {
        const distributor = await distributors.findById(distributorId);
        if (!distributor || distributor.status !== 'active') return false;
        if (distributor.assignedUserIds.includes(userId)) return true;
        return (await territory.listRoutesForUser(userId)).some((r) => distributor.routeIds.includes(r.id));
      },
      canActOnChemist: async (userId, chemistId) => {
        const chemist = await chemists.findById(chemistId);
        if (!chemist || chemist.status !== 'active') return false;
        return (await territory.listRoutesForUser(userId)).some((r) => r.id === chemist.routeId);
      },
      listOutletsForUser: async (userId) => {
        const routeIds = (await territory.listRoutesForUser(userId)).map((r) => r.id);
        const [chemistList, distributorList] = await Promise.all([chemists.listActiveOnRoutes(routeIds), distributors.listActiveForUser(userId, routeIds)]);
        return { chemists: chemistList, distributors: distributorList };
      },
      getSampleAllocation: (doctorId, productId) => sampleAllocations.find(doctorId, productId),
      decrementRemaining: (allocationId, quantity, ctx) => sampleAllocations.decrementRemaining(allocationId, quantity, ctx),
      restoreRemaining: (allocationId, quantity, ctx) => sampleAllocations.restoreRemaining(allocationId, quantity, ctx),
      getChemistLocation: async (id) => (await chemists.findById(id))?.location ?? null,
      getChemist: (id) => chemists.findById(id),
      getProduct: (id) => products.findById(id),
      listActiveProducts: () => products.listActive(),
    },
    bindDoctorReferences: (references) => retirement.bind(references),
    buildRouter: () =>
      buildFieldMasterDataRouter({
        products: makeProductControllers(productUseCases),
        specialties: makeSpecialtyControllers(specialtyUseCases),
        chemists: makeChemistControllers(chemistUseCases),
        doctors: makeDoctorControllers(doctorUseCases),
        distributors: makeDistributorControllers(distributorUseCases),
      }),
  };
}

import type { Router } from 'express';
import type { ConfigReader } from '@/shared/config/readConfig.js';
import { MongooseTransactionRunner } from '@/shared/db/mongooseTransactionRunner.js';
import { makeDoctorApprovalHandler, NEW_DOCTOR_KIND } from './application/doctorApproval.js';
import { DoctorVisibility } from './application/doctorVisibility.js';
import { DoctorViews } from './application/doctorViews.js';
import { AddedDoctors } from './application/usecases/addedDoctors.js';
import { AdjustSampleAllocationUseCase } from './application/usecases/adjustSampleAllocation.usecase.js';
import { AssignDoctorUseCase } from './application/usecases/assignDoctor.usecase.js';
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
import { makeChemistControllers, makeDistributorControllers, makeDoctorControllers, makeProductControllers } from './interface/field-master-data.controller.js';
import { buildFieldMasterDataRouter } from './interface/field-master-data.route.js';

export interface FieldMasterDataContainer {
  contract: FieldMasterDataPublicContract;
  buildRouter: () => Router;
}

/** Identity's, Territory's, Approval's and Config's public contracts, passed in by the composition root. */
export function buildFieldMasterDataContainer(
  users: UserDirectoryPort,
  territory: TerritoryPort,
  approvals: ApprovalsPort,
  config: ConfigReader,
): FieldMasterDataContainer {
  // 1. Adapters
  const products = new MongoProductAdapter();
  const chemists = new MongoChemistAdapter();
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
    onStatusChange: makeDoctorApprovalHandler(doctors, assignments, users, territory, config),
  });

  // 2. Use cases
  const productUseCases = {
    list: new ListProductsUseCase(products),
    create: new CreateProductUseCase(products),
    get: new GetProductUseCase(products),
    update: new UpdateProductUseCase(products),
  };
  const chemistUseCases = {
    list: new ListChemistsUseCase(chemists),
    create: new CreateChemistUseCase(chemists, territory),
    get: new GetChemistUseCase(chemists),
    update: new UpdateChemistUseCase(chemists, territory),
  };

  const visibility = new DoctorVisibility(assignments, territory, users, config);
  const views = new DoctorViews(assignments, users);
  const doctorUseCases = {
    list: new ListDoctorsUseCase(doctors, views),
    create: new CreateDoctorUseCase(doctors, territory, views),
    get: new GetDoctorUseCase(doctors, visibility, views),
    update: new UpdateDoctorUseCase(doctors, assignments, territory, views),
    assigned: new ListAssignedDoctorsUseCase(doctors, visibility, users, views),
    listAssignments: new ListDoctorAssignmentsUseCase(doctors, assignments),
    assign: new AssignDoctorUseCase(doctors, assignments, users, territory, transactions),
    unassign: new UnassignDoctorUseCase(assignments),
    addedDoctors: new AddedDoctors(doctors, territory, approvals, transactions, views),
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
            // A `pending` Doctor doesn't exist yet as far as other modules are concerned.
      getDoctorLocation: async (id) => {
        const doctor = await doctors.findById(id);
        return doctor && doctor.status !== 'pending' ? doctor.location : null;
      },
      getDoctor: async (id) => {
        const doctor = await doctors.findById(id);
        return doctor && doctor.status !== 'pending' ? doctor : null;
      },
      isAssignedToDoctor: async (userId, doctorId) => {
        const doctor = await doctors.findById(doctorId);
        return doctor !== null && (await visibility.isVisibleToAssignee(userId, doctor));
      },
      listAssignedDoctors: async (userId) => {
        const { items } = await doctors.listAssigned(await visibility.scopes([userId]), {}, null);
        return items.map(({ assignedUserId: _assignedUserId, ...doctor }) => doctor);
      },
      getDistributor: (id) => distributors.findById(id),
      canActOnDistributor: async (userId, distributorId) => {
        const distributor = await distributors.findById(distributorId);
        if (!distributor || distributor.status !== 'active') return false;
        if (distributor.assignedMrId === userId) return true;
        return (await territory.listRoutesForUser(userId)).some((r) => r.id === distributor.routeId);
      },
      getSampleAllocation: (doctorId, productId) => sampleAllocations.find(doctorId, productId),
      decrementRemaining: (allocationId, quantity, ctx) => sampleAllocations.decrementRemaining(allocationId, quantity, ctx),
      getChemistLocation: async (id) => (await chemists.findById(id))?.location ?? null,
      getChemist: (id) => chemists.findById(id),
      getProduct: (id) => products.findById(id),
    },
    buildRouter: () =>
      buildFieldMasterDataRouter({
        products: makeProductControllers(productUseCases),
        chemists: makeChemistControllers(chemistUseCases),
        doctors: makeDoctorControllers(doctorUseCases),
        distributors: makeDistributorControllers(distributorUseCases),
      }),
  };
}

import type { Request, RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '@/shared/errors/AppError.js';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { requiredParam } from '@/shared/http/params.util.js';
import { sendSuccess } from '@/shared/http/response.util.js';
import type { Actor } from '../application/actor.js';
import type { AddedDoctors } from '../application/usecases/addedDoctors.js';
import type { AdjustSampleAllocationUseCase } from '../application/usecases/adjustSampleAllocation.usecase.js';
import type { AssignDoctorUseCase } from '../application/usecases/assignDoctor.usecase.js';
import type { CreateChemistUseCase } from '../application/usecases/createChemist.usecase.js';
import type { CreateDistributorUseCase } from '../application/usecases/createDistributor.usecase.js';
import type { CreateDoctorUseCase } from '../application/usecases/createDoctor.usecase.js';
import type { CreateSpecialtyUseCase, GetSpecialtyUseCase, ListSpecialtiesUseCase, UpdateSpecialtyUseCase } from '../application/usecases/specialties.usecase.js';
import type { CreateProductUseCase } from '../application/usecases/createProduct.usecase.js';
import type { GetChemistUseCase } from '../application/usecases/getChemist.usecase.js';
import type { GetDistributorUseCase } from '../application/usecases/getDistributor.usecase.js';
import type { GetDoctorUseCase } from '../application/usecases/getDoctor.usecase.js';
import type { GetProductUseCase } from '../application/usecases/getProduct.usecase.js';
import type { ListChemistsUseCase } from '../application/usecases/listChemists.usecase.js';
import type { IssueSampleAllocationUseCase } from '../application/usecases/issueSampleAllocation.usecase.js';
import type { ListAssignedDoctorsUseCase } from '../application/usecases/listAssignedDoctors.usecase.js';
import type { ListDoctorAssignmentsUseCase } from '../application/usecases/listDoctorAssignments.usecase.js';
import type { ListDistributorsUseCase } from '../application/usecases/listDistributors.usecase.js';
import type { ListDoctorsUseCase } from '../application/usecases/listDoctors.usecase.js';
import type { ListProductsUseCase } from '../application/usecases/listProducts.usecase.js';
import type { ListSampleAllocationsUseCase } from '../application/usecases/listSampleAllocations.usecase.js';
import type { UnassignDoctorUseCase } from '../application/usecases/unassignDoctor.usecase.js';
import type { UpdateChemistUseCase } from '../application/usecases/updateChemist.usecase.js';
import type { UpdateDistributorUseCase } from '../application/usecases/updateDistributor.usecase.js';
import type { UpdateDoctorTargetsUseCase } from '../application/usecases/updateDoctorTargets.usecase.js';
import type { ReviewPendingDoctorUseCase } from '../application/usecases/reviewPendingDoctor.usecase.js';
import type { UpdateDoctorUseCase } from '../application/usecases/updateDoctor.usecase.js';
import type { UpdateProductUseCase } from '../application/usecases/updateProduct.usecase.js';
import type {
  adjustSampleBodySchema,
  issueSampleBodySchema,
  listAddedDoctorsQuerySchema,
  listAssignedDoctorsQuerySchema,
  listChemistsQuerySchema,
  listDistributorsQuerySchema,
  listDoctorsQuerySchema,
  listProductsQuerySchema,
  listSpecialtiesQuerySchema,
  teamDoctorsQuerySchema,
} from './field-master-data.schemas.js';

export function actorOf(req: Request): Actor {
  if (!req.user) throw AppError.unauthenticated();
  return { id: req.user.sub, role: req.user.role };
}

export type CrudHandlers = Record<'list' | 'create' | 'get' | 'update', RequestHandler>;

export function makeProductControllers(u: {
  list: ListProductsUseCase;
  create: CreateProductUseCase;
  get: GetProductUseCase;
  update: UpdateProductUseCase;
}): CrudHandlers {
  return {
    list: asyncHandler(async (req, res) => {
      const query = req.query as unknown as z.output<typeof listProductsQuerySchema>;
      sendSuccess(req, res, await u.list.execute(query), 'Products.', 200);
    }),
    create: asyncHandler(async (req, res) => sendSuccess(req, res, await u.create.execute(req.body), 'Product created.', 201)),
    get: asyncHandler(async (req, res) => sendSuccess(req, res, await u.get.execute(requiredParam(req.params, 'id')), 'Product.', 200)),
    update: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await u.update.execute(requiredParam(req.params, 'id'), req.body), 'Product updated.', 200),
    ),
  };
}

export function makeSpecialtyControllers(u: {
  list: ListSpecialtiesUseCase;
  create: CreateSpecialtyUseCase;
  get: GetSpecialtyUseCase;
  update: UpdateSpecialtyUseCase;
}): CrudHandlers {
  return {
    list: asyncHandler(async (req, res) => {
      const query = req.query as unknown as z.output<typeof listSpecialtiesQuerySchema>;
      sendSuccess(req, res, await u.list.execute(query), 'Specialities.', 200);
    }),
    create: asyncHandler(async (req, res) => sendSuccess(req, res, await u.create.execute(req.body), 'Speciality added.', 201)),
    get: asyncHandler(async (req, res) => sendSuccess(req, res, await u.get.execute(requiredParam(req.params, 'id')), 'Speciality.', 200)),
    update: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await u.update.execute(requiredParam(req.params, 'id'), req.body), 'Speciality updated.', 200),
    ),
  };
}

export function makeChemistControllers(u: {
  list: ListChemistsUseCase;
  create: CreateChemistUseCase;
  get: GetChemistUseCase;
  update: UpdateChemistUseCase;
}): CrudHandlers {
  return {
    list: asyncHandler(async (req, res) => {
      const query = req.query as unknown as z.output<typeof listChemistsQuerySchema>;
      sendSuccess(req, res, await u.list.execute(query), 'Chemists.', 200);
    }),
    create: asyncHandler(async (req, res) => sendSuccess(req, res, await u.create.execute(req.body), 'Chemist created.', 201)),
    get: asyncHandler(async (req, res) => sendSuccess(req, res, await u.get.execute(requiredParam(req.params, 'id')), 'Chemist.', 200)),
    update: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await u.update.execute(requiredParam(req.params, 'id'), req.body), 'Chemist updated.', 200),
    ),
  };
}

export type DoctorHandlers = Record<
  'list' | 'create' | 'get' | 'update' | 'review' | 'updateTargets' | 'mine' | 'team' | 'listAssignments' | 'assign' | 'unassign' | 'added' | 'addDoctor' | 'editAdded' | 'listSamples' | 'issueSample' | 'adjustSample',
  RequestHandler
>;

export function makeDoctorControllers(u: {
  list: ListDoctorsUseCase;
  create: CreateDoctorUseCase;
  get: GetDoctorUseCase;
  update: UpdateDoctorUseCase;
  review: ReviewPendingDoctorUseCase;
  updateTargets: UpdateDoctorTargetsUseCase;
  assigned: ListAssignedDoctorsUseCase;
  listAssignments: ListDoctorAssignmentsUseCase;
  assign: AssignDoctorUseCase;
  unassign: UnassignDoctorUseCase;
  addedDoctors: AddedDoctors;
  listSamples: ListSampleAllocationsUseCase;
  issueSample: IssueSampleAllocationUseCase;
  adjustSample: AdjustSampleAllocationUseCase;
}): DoctorHandlers {
  return {
    list: asyncHandler(async (req, res) => {
      const query = req.query as unknown as z.output<typeof listDoctorsQuerySchema>;
      sendSuccess(req, res, await u.list.execute(query), 'Doctors.', 200);
    }),
    create: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await u.create.execute(req.body, actorOf(req).id), 'Doctor created.', 201),
    ),
    get: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await u.get.execute(actorOf(req), requiredParam(req.params, 'id')), 'Doctor.', 200),
    ),
    update: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await u.update.execute(requiredParam(req.params, 'id'), req.body), 'Doctor updated.', 200),
    ),
    review: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await u.review.execute(actorOf(req), requiredParam(req.params, 'id'), req.body), 'Doctor updated.', 200),
    ),
    updateTargets: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await u.updateTargets.execute(actorOf(req), requiredParam(req.params, 'id'), req.body), 'Visit target updated.', 200),
    ),
    mine: asyncHandler(async (req, res) => {
      const query = req.query as unknown as z.output<typeof listAssignedDoctorsQuerySchema>;
      sendSuccess(req, res, await u.assigned.mine(actorOf(req), query), 'Your doctors.', 200);
    }),
    team: asyncHandler(async (req, res) => {
      const query = req.query as unknown as z.output<typeof teamDoctorsQuerySchema>;
      sendSuccess(req, res, await u.assigned.team(actorOf(req), query), 'Your team’s doctors.', 200);
    }),
    listAssignments: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await u.listAssignments.execute(requiredParam(req.params, 'id')), 'Assignments.', 200),
    ),
    assign: asyncHandler(async (req, res) => {
      const assignment = await u.assign.execute(requiredParam(req.params, 'id'), req.body.userId, actorOf(req).id);
      sendSuccess(req, res, assignment, 'Doctor assigned.', 200);
    }),
    listSamples: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await u.listSamples.execute(actorOf(req), requiredParam(req.params, 'id')), 'Sample allocations.', 200),
    ),
    issueSample: asyncHandler(async (req, res) => {
      const body = req.body as z.output<typeof issueSampleBodySchema>;
      const allocation = await u.issueSample.execute({ doctorId: requiredParam(req.params, 'id'), ...body, adminId: actorOf(req).id });
      sendSuccess(req, res, allocation, 'Samples issued.', 200);
    }),
    adjustSample: asyncHandler(async (req, res) => {
      const body = req.body as z.output<typeof adjustSampleBodySchema>;
      const allocation = await u.adjustSample.execute({
        doctorId: requiredParam(req.params, 'id'),
        productId: requiredParam(req.params, 'productId'),
        total: body.quantityAllocated,
        adminId: actorOf(req).id,
      });
      sendSuccess(req, res, allocation, 'Sample allocation adjusted.', 200);
    }),
    added: asyncHandler(async (req, res) => {
      const query = req.query as unknown as z.output<typeof listAddedDoctorsQuerySchema>;
      sendSuccess(req, res, await u.addedDoctors.list(actorOf(req).id, query), 'Doctors you added.', 200);
    }),
    addDoctor: asyncHandler(async (req, res) => {
      const { doctor, created } = await u.addedDoctors.add(actorOf(req).id, req.body);
      // 200 for a retry of a create that already went through, so the app can tell the two apart.
      sendSuccess(req, res, doctor, created ? 'Doctor added and sent for approval.' : 'Doctor was already added.', created ? 201 : 200);
    }),
    editAdded: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await u.addedDoctors.edit(actorOf(req).id, requiredParam(req.params, 'id'), req.body), 'Doctor updated and resubmitted.', 200),
    ),
    unassign: asyncHandler(async (req, res) => {
      await u.unassign.execute(requiredParam(req.params, 'id'), requiredParam(req.params, 'userId'), actorOf(req).id);
      sendSuccess(req, res, null, 'Assignment removed.', 200);
    }),
  };
}

export function makeDistributorControllers(u: {
  list: ListDistributorsUseCase;
  create: CreateDistributorUseCase;
  get: GetDistributorUseCase;
  update: UpdateDistributorUseCase;
}): CrudHandlers {
  return {
    list: asyncHandler(async (req, res) => {
      const query = req.query as unknown as z.output<typeof listDistributorsQuerySchema>;
      sendSuccess(req, res, await u.list.execute(query), 'Distributors.', 200);
    }),
    create: asyncHandler(async (req, res) => sendSuccess(req, res, await u.create.execute(req.body), 'Distributor created.', 201)),
    get: asyncHandler(async (req, res) => sendSuccess(req, res, await u.get.execute(requiredParam(req.params, 'id')), 'Distributor.', 200)),
    update: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await u.update.execute(requiredParam(req.params, 'id'), req.body), 'Distributor updated.', 200),
    ),
  };
}

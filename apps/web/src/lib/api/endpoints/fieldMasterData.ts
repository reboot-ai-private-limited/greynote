import type {
  AdjustSampleDto,
  ChemistDto,
  CreateChemistDto,
  CreateDistributorDto,
  CreateDoctorDto,
  CreateProductDto,
  CreateSpecialtyDto,
  DistributorDetailDto,
  DistributorDto,
  DoctorAssignmentDto,
  DoctorDeleteResultDto,
  DoctorDto,
  DoctorImpactDto,
  DoctorStatus,
  IssueSampleDto,
  MasterStatus,
  PaginatedDto,
  PaginationQueryDto,
  ProductDto,
  SampleAllocationDto,
  SpecialtyDto,
  UpdateChemistDto,
  UpdateDistributorDto,
  UpdateSpecialtyDto,
  UpdateDoctorDto,
  UpdateProductDto,
  PhotoDto,
} from '@greynote/contracts';
import { request } from '../client';

const BASE = '/field-master-data';

export interface ListProductsQuery extends PaginationQueryDto {
  status?: MasterStatus | undefined;
  category?: string | undefined;
}
export interface ListChemistsQuery extends PaginationQueryDto {
  status?: MasterStatus | undefined;
  routeId?: string | undefined;
}
export interface ListDoctorsQuery extends PaginationQueryDto {
  /** Includes `pending`: the Doctors MRs added that await approval. */
  status?: DoctorStatus | undefined;
  routeId?: string | undefined;
  /** Matches the name. */
  search?: string | undefined;
}
export interface ListEmployeeDoctorsQuery extends PaginationQueryDto {
  search?: string | undefined;
  routeId?: string | undefined;
}
export interface ListDistributorsQuery extends PaginationQueryDto {
  status?: MasterStatus | undefined;
  routeId?: string | undefined;
  hqId?: string | undefined;
  zoneId?: string | undefined;
  assignedUserId?: string | undefined;
}

export const productsApi = {
  list: (token: string, query: ListProductsQuery | undefined, signal?: AbortSignal) =>
    request<PaginatedDto<ProductDto>>(`${BASE}/products`, { token, ...(query && { query: { ...query } }), signal }),
  create: (token: string, body: CreateProductDto) => request<ProductDto>(`${BASE}/products`, { method: 'POST', token, body }),
  update: (token: string, id: string, body: UpdateProductDto) =>
    request<ProductDto>(`${BASE}/products/${id}`, { method: 'PATCH', token, body }),
};

export interface ListSpecialtiesQuery extends PaginationQueryDto {
  status?: MasterStatus | undefined;
}

export const specialtiesApi = {
  list: (token: string, query: ListSpecialtiesQuery | undefined, signal?: AbortSignal) =>
    request<PaginatedDto<SpecialtyDto>>(`${BASE}/specialties`, { token, ...(query && { query: { ...query } }), signal }),
  create: (token: string, body: CreateSpecialtyDto) => request<SpecialtyDto>(`${BASE}/specialties`, { method: 'POST', token, body }),
  update: (token: string, id: string, body: UpdateSpecialtyDto) =>
    request<SpecialtyDto>(`${BASE}/specialties/${id}`, { method: 'PATCH', token, body }),
};

export const chemistsApi = {
  get: (token: string, id: string, signal?: AbortSignal) => request<ChemistDto>(`${BASE}/chemists/${id}`, { token, signal }),
  list: (token: string, query: ListChemistsQuery | undefined, signal?: AbortSignal) =>
    request<PaginatedDto<ChemistDto>>(`${BASE}/chemists`, { token, ...(query && { query: { ...query } }), signal }),
  create: (token: string, body: CreateChemistDto) => request<ChemistDto>(`${BASE}/chemists`, { method: 'POST', token, body }),
  update: (token: string, id: string, body: UpdateChemistDto) =>
    request<ChemistDto>(`${BASE}/chemists/${id}`, { method: 'PATCH', token, body }),
};

export const distributorsApi = {
  list: (token: string, query: ListDistributorsQuery | undefined, signal?: AbortSignal) =>
    request<PaginatedDto<DistributorDto>>(`${BASE}/distributors`, { token, ...(query && { query: { ...query } }), signal }),
  get: (token: string, id: string, signal?: AbortSignal) =>
    request<DistributorDetailDto>(`${BASE}/distributors/${id}`, { token, signal }),
  create: (token: string, body: CreateDistributorDto) =>
    request<DistributorDto>(`${BASE}/distributors`, { method: 'POST', token, body }),
  update: (token: string, id: string, body: UpdateDistributorDto) =>
    request<DistributorDto>(`${BASE}/distributors/${id}`, { method: 'PATCH', token, body }),
};

export const doctorsApi = {
  list: (token: string, query: ListDoctorsQuery | undefined, signal?: AbortSignal) =>
    request<PaginatedDto<DoctorDto>>(`${BASE}/doctors`, { token, ...(query && { query: { ...query } }), signal }),
  /** Admin: the doctors assigned to one employee. */
  assignedTo: (token: string, userId: string, query: ListEmployeeDoctorsQuery | undefined, signal?: AbortSignal) =>
    request<PaginatedDto<DoctorDto>>(`${BASE}/doctors/assigned`, { token, query: { ...query, userId }, signal }),
  get: (token: string, id: string, signal?: AbortSignal) => request<DoctorDto>(`${BASE}/doctors/${id}`, { token, signal }),
  create: (token: string, body: CreateDoctorDto) => request<DoctorDto>(`${BASE}/doctors`, { method: 'POST', token, body }),
  update: (token: string, id: string, body: UpdateDoctorDto) =>
    request<DoctorDto>(`${BASE}/doctors/${id}`, { method: 'PATCH', token, body }),

  /** `multipart/form-data` with one `file`. Admin, or the MR who added the doctor until it is approved. Replaces any photo. */
  setPhoto: (token: string, id: string, body: FormData) => request<PhotoDto>(`${BASE}/doctors/${id}/photo`, { method: 'PUT', token, body }),
  removePhoto: (token: string, id: string) => request<PhotoDto>(`${BASE}/doctors/${id}/photo`, { method: 'DELETE', token }),

  /** What deactivating or deleting the doctor would touch (Admin). */
  impact: (token: string, id: string, signal?: AbortSignal) => request<DoctorImpactDto>(`${BASE}/doctors/${id}/impact`, { token, signal }),
  /** Deletes the doctor for good; it is archived so history keeps its name. */
  remove: (token: string, id: string) => request<DoctorDeleteResultDto>(`${BASE}/doctors/${id}`, { method: 'DELETE', token }),
  review: (token: string, id: string, body: UpdateDoctorDto) =>
    request<DoctorDto>(`${BASE}/doctors/${id}/review`, { method: 'PATCH', token, body }),
  assignments: (token: string, id: string, signal?: AbortSignal) =>
    request<DoctorAssignmentDto[]>(`${BASE}/doctors/${id}/assignments`, { token, signal }),
  /** Makes the MR responsible, replacing whoever was. The MR must have the Doctor's Route. */
  assign: (token: string, id: string, userId: string) =>
    request<DoctorAssignmentDto>(`${BASE}/doctors/${id}/assignments`, { method: 'POST', token, body: { userId } }),
  unassign: (token: string, id: string, userId: string) =>
    request<Record<string, never>>(`${BASE}/doctors/${id}/assignments/${userId}`, { method: 'DELETE', token }),

  samples: (token: string, id: string, signal?: AbortSignal) =>
    request<SampleAllocationDto[]>(`${BASE}/doctors/${id}/sample-allocations`, { token, signal }),
  /** Adds to an existing allocation of the same Product. */
  issueSample: (token: string, id: string, body: IssueSampleDto) =>
    request<SampleAllocationDto>(`${BASE}/doctors/${id}/sample-allocations`, { method: 'POST', token, body }),
  /** Sets the allocated total; refused below what has already been given out. */
  adjustSample: (token: string, id: string, productId: string, body: AdjustSampleDto) =>
    request<SampleAllocationDto>(`${BASE}/doctors/${id}/sample-allocations/${productId}`, { method: 'PATCH', token, body }),
};

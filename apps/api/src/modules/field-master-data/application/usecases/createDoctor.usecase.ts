import type { Doctor } from '../../domain/doctor.entity.js';
import type { DoctorRepositoryPort } from '../../domain/doctor.repository.port.js';
import type { TerritoryPort } from '../../domain/territory.port.js';
import type { DoctorView, DoctorViews } from '../doctorViews.js';
import { requireActiveRoute } from '../requireActiveRoute.js';

export type CreateDoctorInput = Pick<Doctor, 'routeId' | 'category' | 'name' | 'address' | 'email' | 'specialty' | 'qualification' | 'location'>;

/** Admin adds a Doctor on an active Route, with a map-picked location. No approval; it is active at once. */
export class CreateDoctorUseCase {
  constructor(
    private readonly doctors: DoctorRepositoryPort,
    private readonly territory: TerritoryPort,
    private readonly views: DoctorViews,
  ) {}

  async execute(input: CreateDoctorInput, adminId: string): Promise<DoctorView> {
    await requireActiveRoute(this.territory, input.routeId);
    const doctor = await this.doctors.create({ ...input, capturedLocation: null, clientRequestId: null, status: 'active', addedBy: adminId, approvedAt: new Date() });
    return this.views.one(doctor);
  }
}

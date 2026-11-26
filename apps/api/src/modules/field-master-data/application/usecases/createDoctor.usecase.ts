import type { Doctor } from '../../domain/doctor.entity.js';
import type { DoctorRepositoryPort } from '../../domain/doctor.repository.port.js';
import type { TerritoryPort } from '../../domain/territory.port.js';
import type { DoctorView, DoctorViews } from '../doctorViews.js';
import type { SpecialtyCatalog } from '../specialtyCatalog.js';
import { resolvePlace } from '../requireActiveRoute.js';
import { requireUniquePhone } from '../phoneUniqueness.js';

export type CreateDoctorInput = Pick<Doctor, 'name' | 'address' | 'email' | 'specialty' | 'qualification' | 'location'> &
  Partial<Pick<Doctor, 'clinicName' | 'phone' | 'dateOfBirth' | 'anniversary' | 'visitFrequency'>> & {
    /** The place (2026-11-26); an older client may send a route instead, whose To place is used. */
    placeId?: string | undefined;
    routeId?: string | undefined;
  };

/** Admin adds a Doctor on an active place, with a map-picked location. No approval; it is active at once. */
export class CreateDoctorUseCase {
  constructor(
    private readonly doctors: DoctorRepositoryPort,
    private readonly territory: TerritoryPort,
    private readonly views: DoctorViews,
    private readonly specialties: SpecialtyCatalog,
  ) {}

  async execute(input: CreateDoctorInput, adminId: string): Promise<DoctorView> {
    const where = await resolvePlace(this.territory, input);
    await requireUniquePhone((phone, exclude) => this.doctors.findByPhone(phone, exclude), input.phone, 'doctor');
    const specialty = await this.specialties.resolve(input.specialty);
    const doctor = await this.doctors.create({ clinicName: null, phone: null, photo: null, dateOfBirth: null, anniversary: null, visitFrequency: null, ...input, ...where, specialty, capturedLocation: null, clientRequestId: null, status: 'active', addedBy: adminId, approvedAt: new Date() });
    return this.views.one(doctor);
  }
}

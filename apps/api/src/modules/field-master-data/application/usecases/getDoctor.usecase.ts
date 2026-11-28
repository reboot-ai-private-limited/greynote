import { AppError } from '@/shared/errors/AppError.js';
import type { DoctorRepositoryPort } from '../../domain/doctor.repository.port.js';
import type { Actor } from '../actor.js';
import type { DoctorVisibility } from '../doctorVisibility.js';
import type { DoctorView, DoctorViews } from '../doctorViews.js';
import type { TerritoryPort } from '../../domain/territory.port.js';

/** Admin, the assigned MR, or a manager of that MR; anyone else gets a 404, so a Doctor's existence isn't revealed. */
export class GetDoctorUseCase {
  constructor(
    private readonly doctors: DoctorRepositoryPort,
    private readonly visibility: DoctorVisibility,
    private readonly views: DoctorViews,
    private readonly places?: Pick<TerritoryPort, 'getPlace'>,
  ) {}

  /** With the place's name (2026-11-28): a manager's phone may not hold the places of an MR in another HQ, and the approval preview shows it. */
  async execute(actor: Actor, id: string): Promise<DoctorView & { placeName?: string | null }> {
    const doctor = await this.doctors.findById(id);
    if (!doctor || !(await this.visibility.canView(actor, doctor))) throw AppError.notFound('No such doctor.');
    const view = await this.views.one(doctor);
    if (!this.places) return view;
    return { ...view, placeName: doctor.placeId ? ((await this.places.getPlace(doctor.placeId))?.name ?? null) : null };
  }
}

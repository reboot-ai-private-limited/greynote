import { AppError } from '@/shared/errors/AppError.js';
import type { SpecialtyRepositoryPort } from '../domain/specialty.repository.port.js';

/** A doctor's speciality must be one on the Admin's list. Returns the list's own spelling, so "ent" is stored as "ENT". */
export class SpecialtyCatalog {
  constructor(private readonly specialties: SpecialtyRepositoryPort) {}

  async resolve(name: string): Promise<string> {
    const found = await this.specialties.findByName(name);
    if (!found || found.status !== 'active') {
      throw AppError.badRequest('Choose a speciality from the list.', { field: 'specialty' });
    }
    return found.name;
  }
}

import { AppError } from '@/shared/errors/AppError.js';
import type { HolidayRepositoryPort } from '../../domain/holiday.repository.port.js';

/**
 * Removing a holiday doesn't change leave already requested — its counted days are stored. `group` removes every
 * day of a holiday added as a range; without it (or for a single-day holiday) only this day goes. Returns how many.
 */
export class DeleteHolidayUseCase {
  constructor(private readonly holidays: HolidayRepositoryPort) {}

  async execute(id: string, options: { group: boolean } = { group: false }): Promise<number> {
    const holiday = await this.holidays.findById(id);
    if (!holiday) throw AppError.notFound('No such holiday.');
    if (options.group && holiday.groupId) return this.holidays.deleteGroup(holiday.groupId);
    if (!(await this.holidays.delete(id))) throw AppError.notFound('No such holiday.');
    return 1;
  }
}

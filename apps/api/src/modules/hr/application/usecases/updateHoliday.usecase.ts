import { AppError } from '@/shared/errors/AppError.js';
import type { Holiday } from '../../domain/holiday.entity.js';
import type { HolidayRepositoryPort } from '../../domain/holiday.repository.port.js';
import type { CreateHolidayInput, CreateHolidayUseCase } from './createHoliday.usecase.js';

/**
 * Changing a holiday replaces it: the new days are checked and written first (so a refused change leaves the old holiday as it was), then the old
 * ones go. `group` replaces every day of a holiday added as a range, otherwise only this day. Leave already counted keeps the days it was counted with.
 */
export class UpdateHolidayUseCase {
  constructor(
    private readonly holidays: HolidayRepositoryPort,
    private readonly create: CreateHolidayUseCase,
  ) {}

  async execute(id: string, input: CreateHolidayInput, options: { group: boolean }, actorId: string): Promise<Holiday[]> {
    const old = await this.holidays.findById(id);
    if (!old) throw AppError.notFound('No such holiday.');
    const days = await this.create.execute(input, actorId);
    if (options.group && old.groupId) await this.holidays.deleteGroup(old.groupId);
    else await this.holidays.delete(id);
    return days;
  }
}
